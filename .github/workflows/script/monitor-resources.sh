#!/bin/bash
set -eo pipefail

#
# Resource monitoring script for GitHub Actions runners
# Usage: ./monitor-resources.sh start|stop
#

METRICS_FILE="${HOME}/.solo/logs/runner-metrics.csv"
PID_FILE="${HOME}/.solo/logs/monitor.pid"
STATUS_DIR="${HOME}/.solo/logs"
CHART_STATUS_FILE="$STATUS_DIR/chart_status"
CHART_PATH_FILE="$STATUS_DIR/chart_path"
UPLOAD_STATUS_FILE="$STATUS_DIR/chart_upload_status"
UPLOAD_URL_FILE="$STATUS_DIR/chart_upload_url"

start_monitoring() {
  echo "Starting resource monitoring..."
  
  # Create metrics directory
  mkdir -p "$(dirname "$METRICS_FILE")"
  
  # Write CSV header
  echo "timestamp,cpu_percent,mem_used_gb,mem_total_gb,mem_percent" > "$METRICS_FILE"
  
  # Start monitoring in background
  (
    while true; do
      TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")
      CPU_PERCENT=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
      MEM_INFO=$(free -g | grep Mem)
      MEM_TOTAL=$(echo $MEM_INFO | awk '{print $2}')
      MEM_USED=$(echo $MEM_INFO | awk '{print $3}')
      MEM_PERCENT=$(echo $MEM_INFO | awk '{printf "%.1f", ($3/$2)*100}')
      
      echo "$TIMESTAMP,$CPU_PERCENT,$MEM_USED,$MEM_TOTAL,$MEM_PERCENT" >> "$METRICS_FILE"
      sleep 30
    done
  ) &
  
  MONITOR_PID=$!
  echo $MONITOR_PID > "$PID_FILE"
  echo "Started resource monitoring (PID: $MONITOR_PID)"
}

stop_monitoring() {
  echo "Stopping resource monitoring..."
  
  if [[ -f "$PID_FILE" ]]; then
    MONITOR_PID=$(cat "$PID_FILE")
    kill $MONITOR_PID 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "Stopped resource monitoring (PID: $MONITOR_PID)"
  else
    echo "No PID file found, monitoring may not be running"
  fi
  
  # Display metrics summary
  if [[ -f "$METRICS_FILE" ]]; then
    echo "::group::Resource Metrics Summary"
    echo "Collected $(wc -l < "$METRICS_FILE") data points"
    echo ""
    echo "Peak CPU: $(tail -n +2 "$METRICS_FILE" | cut -d',' -f2 | sort -rn | head -1)%"
    echo "Peak Memory: $(tail -n +2 "$METRICS_FILE" | cut -d',' -f5 | sort -rn | head -1)%"
    echo ""
    echo "Last 10 measurements:"
    if command -v column >/dev/null 2>&1; then
      tail -10 "$METRICS_FILE" | column -t -s','
    else
      echo "(Install 'column' to view table formatting)"
      tail -10 "$METRICS_FILE"
    fi
    echo "::endgroup::"
  else
    echo "No metrics file found at $METRICS_FILE"
  fi
}

generate_chart() {
  local metrics_file="${1:-$METRICS_FILE}"
  echo "Generating resource metrics chart..."
  
  if [[ -f "$metrics_file" ]]; then
    PYTHON_BIN=$(command -v python3 || command -v python || true)
    if [[ -z "$PYTHON_BIN" ]]; then
      echo "::error::Python interpreter not found on runner"
      echo "chart_generated=false" >> $GITHUB_OUTPUT
      return 1
    fi

    echo "Installing matplotlib..."
    "$PYTHON_BIN" -m pip install matplotlib --quiet
    
    echo "Generating chart..."
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    "$PYTHON_BIN" "${SCRIPT_DIR}/plot-runner-metrics.py" "$metrics_file"
    
    CHART_FILE="${metrics_file%.csv}.png"
    if [[ -f "$CHART_FILE" ]]; then
      echo "true" > "$CHART_STATUS_FILE"
      echo "$CHART_FILE" > "$CHART_PATH_FILE"
      echo "chart_generated=true" >> $GITHUB_OUTPUT
      echo "chart_file=$CHART_FILE" >> $GITHUB_OUTPUT
      echo "Chart generated successfully: $CHART_FILE"
    else
      echo "false" > "$CHART_STATUS_FILE"
      : > "$CHART_PATH_FILE"
      echo "chart_generated=false" >> $GITHUB_OUTPUT
      echo "Failed to generate chart"
    fi
  else
    echo "No metrics CSV found at $metrics_file, skipping chart generation"
    echo "false" > "$CHART_STATUS_FILE"
    : > "$CHART_PATH_FILE"
    echo "chart_generated=false" >> $GITHUB_OUTPUT
  fi
}

upload_chart() {
  CHART_FILE="${1}"
  PR_NUMBER="${2}"
  REPO="${3}"
  GITHUB_TOKEN="${4}"
  
  # Validate required parameters
  if [[ -z "$CHART_FILE" ]]; then
    echo "::error::Chart file path not provided"
    echo "upload_success=false" >> $GITHUB_OUTPUT
    echo "false" > "$UPLOAD_STATUS_FILE"
    : > "$UPLOAD_URL_FILE"
    return 1
  fi
  
  if [[ -z "$PR_NUMBER" ]]; then
    echo "::error::PR number not provided"
    echo "upload_success=false" >> $GITHUB_OUTPUT
    echo "false" > "$UPLOAD_STATUS_FILE"
    : > "$UPLOAD_URL_FILE"
    return 1
  fi
  
  if [[ -z "$REPO" ]]; then
    echo "::error::Repository name not provided"
    echo "upload_success=false" >> $GITHUB_OUTPUT
    echo "false" > "$UPLOAD_STATUS_FILE"
    : > "$UPLOAD_URL_FILE"
    return 1
  fi
  
  if [[ -z "$GITHUB_TOKEN" ]]; then
    echo "::error::GitHub token not provided"
    echo "upload_success=false" >> $GITHUB_OUTPUT
    echo "false" > "$UPLOAD_STATUS_FILE"
    : > "$UPLOAD_URL_FILE"
    return 1
  fi
  
  if [[ ! -f "$CHART_FILE" ]]; then
    echo "::error::Chart file not found: $CHART_FILE"
    echo "upload_success=false" >> $GITHUB_OUTPUT
    echo "false" > "$UPLOAD_STATUS_FILE"
    : > "$UPLOAD_URL_FILE"
    return 1
  fi
  
  echo "Uploading chart to GitHub CDN..."
  echo "  Chart file: $CHART_FILE"
  echo "  Chart size: $(du -h "$CHART_FILE" | cut -f1)"
  echo "  PR number: $PR_NUMBER"
  echo "  Repository: $REPO"
  
  # Upload image to GitHub's CDN using the issue attachments API
  HTTP_CODE=$(curl -s -w "%{http_code}" -o /tmp/upload_response.json -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    -H "Content-Type: image/png" \
    --data-binary "@${CHART_FILE}" \
    "https://uploads.github.com/repos/${REPO}/issues/${PR_NUMBER}/assets?name=runner-metrics.png")
  
  RESPONSE=$(cat /tmp/upload_response.json)
  
  echo "  HTTP Status: $HTTP_CODE"
  
  # Extract image URL from response
  IMAGE_URL=$(echo "$RESPONSE" | grep -o '"url":"https://user-images.githubusercontent.com[^"]*"' | sed 's/"url":"//;s/"$//')
  
  if [[ -n "$IMAGE_URL" ]]; then
    echo "✅ Chart uploaded successfully to GitHub CDN"
    echo "  Image URL: $IMAGE_URL"
    echo "image_url=$IMAGE_URL" >> $GITHUB_OUTPUT
    echo "upload_success=true" >> $GITHUB_OUTPUT
    echo "true" > "$UPLOAD_STATUS_FILE"
    echo "$IMAGE_URL" > "$UPLOAD_URL_FILE"
  else
    echo "::error::Failed to upload chart to GitHub CDN"
    echo "::group::API Response Details"
    echo "HTTP Status Code: $HTTP_CODE"
    echo "Response Body:"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    
    # Parse common error messages
    ERROR_MSG=$(echo "$RESPONSE" | grep -o '"message":"[^"]*"' | sed 's/"message":"//;s/"$//' | head -1)
    if [[ -n "$ERROR_MSG" ]]; then
      echo "Error Message: $ERROR_MSG"
    fi
    echo "::endgroup::"
    
    echo "upload_success=false" >> $GITHUB_OUTPUT
    echo "false" > "$UPLOAD_STATUS_FILE"
    : > "$UPLOAD_URL_FILE"
    return 1
  fi
}

# Main
case "${1:-}" in
  start)
    start_monitoring
    ;;
  stop)
    stop_monitoring
    ;;
  generate_chart)
    generate_chart "${2:-}"
    ;;
  upload_chart)
    upload_chart "${2}" "${3}" "${4}" "${5}"
    ;;
  *)
    echo "Usage: $0 {start|stop|generate_chart [csv]|upload_chart <chart_file> <pr_number> <repo> <token>}"
    exit 1
    ;;
esac
