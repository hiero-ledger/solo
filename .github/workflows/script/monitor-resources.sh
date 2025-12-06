#!/bin/bash
set -eo pipefail

#
# Resource monitoring script for GitHub Actions runners
# Usage: ./monitor-resources.sh start|stop
#

METRICS_FILE="${HOME}/.solo/logs/runner-metrics.csv"
PID_FILE="${HOME}/.solo/logs/monitor.pid"

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
      MEM_TOTAL=$(echo "$MEM_INFO" | awk '{print $2}')
      MEM_USED=$(echo "$MEM_INFO" | awk '{print $3}')
      MEM_PERCENT=$(echo "$MEM_INFO" | awk '{printf "%.1f", ($3/$2)*100}')

      echo "$TIMESTAMP,$CPU_PERCENT,$MEM_USED,$MEM_TOTAL,$MEM_PERCENT" >> "$METRICS_FILE"
      sleep 60
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

# Main
case "${1:-}" in
  start)
    start_monitoring
    ;;
  stop)
    stop_monitoring
    ;;
  *)
    echo "Usage: $0 {start|stop}"
    exit 1
    ;;
esac
