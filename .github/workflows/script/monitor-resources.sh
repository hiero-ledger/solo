#!/bin/bash
set -eo pipefail

#
# Resource monitoring script for GitHub Actions runners
# Usage: ./monitor-resources.sh start [interval_seconds]|stop
#   interval_seconds  How often to sample (default: 60, min: 10)
#

METRICS_FILE="${HOME}/.solo/logs/runner-metrics.jsonl"
PID_FILE="${HOME}/.solo/logs/monitor.pid"
INTERVAL_FILE="${HOME}/.solo/logs/monitor.interval"

start_monitoring() {
  local interval="${1:-60}"
  # Enforce minimum of 10 seconds to avoid thrashing
  if (( interval < 10 )); then
    echo "Warning: interval ${interval}s is below minimum; using 10s"
    interval=10
  fi

  echo "Starting resource monitoring (interval: ${interval}s)..."

  # Create metrics directory
  mkdir -p "$(dirname "$METRICS_FILE")"

  # Persist interval so stop_monitoring can report it
  echo "$interval" > "$INTERVAL_FILE"

  # Initialize metrics file
  : > "$METRICS_FILE"

  # Start monitoring in background
  (
    while true; do
      TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")
      CPU_PERCENT=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
      MEM_INFO=$(free -m | grep Mem)
      MEM_TOTAL=$(echo "$MEM_INFO" | awk '{print $2}')
      MEM_USED=$(echo "$MEM_INFO" | awk '{print $3}')
      MEM_PERCENT=$(echo "$MEM_INFO" | awk '{if ($2 > 0) printf "%.1f", ($3/$2)*100; else print "0.0"}')

      echo "{\"timestamp\":\"$TIMESTAMP\",\"cpu_percent\":$CPU_PERCENT,\"mem_used_mb\":$MEM_USED,\"mem_total_mb\":$MEM_TOTAL,\"mem_percent\":$MEM_PERCENT}" >> "$METRICS_FILE"
      sleep "$interval"
    done
  ) &

  MONITOR_PID=$!
  echo "$MONITOR_PID" > "$PID_FILE"
  echo "Started resource monitoring (PID: $MONITOR_PID)"
}

stop_monitoring() {
  local interval=60
  [[ -f "$INTERVAL_FILE" ]] && interval=$(cat "$INTERVAL_FILE")

  echo "Stopping resource monitoring..."

  if [[ -f "$PID_FILE" ]]; then
    MONITOR_PID=$(cat "$PID_FILE")
    kill "$MONITOR_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "Stopped resource monitoring (PID: $MONITOR_PID)"
  else
    echo "No PID file found, monitoring may not be running"
  fi
  rm -f "$INTERVAL_FILE"

  # Display metrics summary
  if [[ -f "$METRICS_FILE" ]]; then
    echo "::group::Resource Metrics Summary"
    echo "Sample interval: ${interval}s  |  Collected $(wc -l < "$METRICS_FILE") data points"
    echo ""
    PEAK_CPU=$(jq -r '.cpu_percent' "$METRICS_FILE" 2>/dev/null | sort -rn | head -1 || echo "")
    PEAK_MEM_MB=$(jq -r '.mem_used_mb' "$METRICS_FILE" 2>/dev/null | sort -rn | head -1 || echo "")
    PEAK_MEM_PCT=$(jq -r '.mem_percent' "$METRICS_FILE" 2>/dev/null | sort -rn | head -1 || echo "")
    MEM_TOTAL_MB=$(jq -r '.mem_total_mb' "$METRICS_FILE" 2>/dev/null | tail -1 || echo "")
    if [[ -n "$PEAK_CPU" ]]; then
      echo "Peak CPU: ${PEAK_CPU}%"
    else
      echo "Peak CPU: N/A"
    fi
    if [[ -n "$PEAK_MEM_MB" ]]; then
      echo "Peak Memory: ${PEAK_MEM_MB} MB / ${MEM_TOTAL_MB} MB (${PEAK_MEM_PCT}%)"
    else
      echo "Peak Memory: N/A"
    fi
    echo ""
    echo "Last 10 measurements:"
    if command -v column >/dev/null 2>&1; then
      tail -10 "$METRICS_FILE" | jq -r '"\(.timestamp)\t\(.cpu_percent)%\t\(.mem_used_mb) MB / \(.mem_total_mb) MB (\(.mem_percent)%)"' | column -t -s$'\t'
    else
      echo "(Install 'column' to view table formatting)"
      tail -10 "$METRICS_FILE" | jq -r '"\(.timestamp) CPU=\(.cpu_percent)% MEM=\(.mem_used_mb)/\(.mem_total_mb)MB (\(.mem_percent)%)"'
    fi
    echo "::endgroup::"
  else
    echo "No metrics file found at $METRICS_FILE"
  fi
}

# Main
case "${1:-}" in
  start)
    start_monitoring "${2:-60}"
    ;;
  stop)
    stop_monitoring
    ;;
  *)
    echo "Usage: $0 {start [interval_seconds]|stop}"
    exit 1
    ;;
esac
