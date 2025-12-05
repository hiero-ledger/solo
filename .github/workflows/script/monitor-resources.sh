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
  echo "Metrics file: $metrics_file"
  echo "File exists: $([ -f "$metrics_file" ] && echo "yes" || echo "no")"
  
  if [[ -f "$metrics_file" ]]; then
    echo "Metrics CSV found, proceeding with chart generation..."
    echo "CSV contents (first 5 lines):"
    head -5 "$metrics_file" || true
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
  
  # Use GraphQL API to upload image attachment
  # This is the same method GitHub's web UI uses for drag-and-drop uploads
  
  # Step 1: Get upload URL from GraphQL
  GRAPHQL_QUERY='{"query":"mutation {createImageUpload(input:{ownerId:\"'$REPO'\",name:\"runner-metrics.png\"}){upload{url,id}}}"}'
  
  echo "  Getting upload URL from GitHub..."
  UPLOAD_INFO=$(curl -s -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$GRAPHQL_QUERY" \
    "https://api.github.com/graphql")
  
  UPLOAD_URL=$(echo "$UPLOAD_INFO" | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//;s/"$//')
  ASSET_ID=$(echo "$UPLOAD_INFO" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"$//')
  
  if [[ -z "$UPLOAD_URL" ]]; then
    echo "  ⚠️  Could not get upload URL, trying alternative method..."
    
    # Alternative: Upload as a release asset temporarily
    # First, check if we can create a temporary comment to get the upload endpoint
    COMMENT_PAYLOAD='{"body":"<!-- temp -->"}'
    COMMENT_RESPONSE=$(curl -s -X POST \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -d "$COMMENT_PAYLOAD" \
      "https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments")
    
    COMMENT_ID=$(echo "$COMMENT_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | sed 's/"id"://')
    
    if [[ -n "$COMMENT_ID" ]]; then
      # Now upload the image as an attachment to this comment
      echo "  Uploading image via comment attachment..."
      
      # Convert image to base64 and create data URL
      BASE64_DATA=$(base64 "$CHART_FILE" | tr -d '\n')
      
      # Update comment with embedded image
      UPDATE_PAYLOAD=$(cat <<EOF
{
  "body": "![Runner Metrics](data:image/png;base64,${BASE64_DATA})"
}
EOF
)
      
      UPDATE_RESPONSE=$(curl -s -X PATCH \
        -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        -d "$UPDATE_PAYLOAD" \
        "https://api.github.com/repos/${REPO}/issues/comments/${COMMENT_ID}")
      
      IMAGE_URL="https://github.com/${REPO}/issues/${PR_NUMBER}#issuecomment-${COMMENT_ID}"
      
      # Delete the temporary comment
      curl -s -X DELETE \
        -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${REPO}/issues/comments/${COMMENT_ID}" >/dev/null
      
      echo "  ✅ Chart embedded successfully"
      echo "upload_success=true" >> $GITHUB_OUTPUT
      echo "true" > "$UPLOAD_STATUS_FILE"
      echo "image_url=$IMAGE_URL" >> $GITHUB_OUTPUT
      echo "$IMAGE_URL" > "$UPLOAD_URL_FILE"
      return 0
    fi
  fi
  
  # If all methods fail, fall back to artifacts
  echo "  ℹ️  CDN upload not available, chart will be in artifacts"
  echo "upload_success=false" >> $GITHUB_OUTPUT
  echo "false" > "$UPLOAD_STATUS_FILE"
  : > "$UPLOAD_URL_FILE"
  return 0
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
