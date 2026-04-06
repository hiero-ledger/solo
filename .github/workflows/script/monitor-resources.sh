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

      # Sum CPU (millicores) and memory (MB) of all running pods across all namespaces
      POD_MEM_MB=0
      POD_CPU_M=0
      if command -v kubectl >/dev/null 2>&1; then
        read -r POD_CPU_M POD_MEM_MB < <(kubectl top pods --all-namespaces --no-headers 2>/dev/null \
          | awk '
            {
              # CPU column ($3): strip "m" suffix (millicores); no suffix means cores → multiply by 1000
              cpu=$3; sub(/m$/,"",cpu);
              if ($3 !~ /m$/) cpu=cpu*1000;
              cpu_total += cpu+0;
              # Memory column ($4): strip Mi/Gi suffix
              mem=$4;
              if (mem ~ /Gi$/) { sub(/Gi$/,"",mem); mem=mem*1024; }
              else { sub(/Mi$/,"",mem); }
              mem_total += mem+0;
            }
            END { printf "%d %d", cpu_total, mem_total }
          ' || echo "0 0")
      fi

      echo "{\"timestamp\":\"$TIMESTAMP\",\"cpu_percent\":$CPU_PERCENT,\"mem_used_mb\":$MEM_USED,\"mem_total_mb\":$MEM_TOTAL,\"mem_percent\":$MEM_PERCENT,\"pod_mem_mb\":${POD_MEM_MB:-0},\"pod_cpu_m\":${POD_CPU_M:-0}}" >> "$METRICS_FILE"
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
    PEAK_POD_MEM_MB=$(jq -r '.pod_mem_mb // 0' "$METRICS_FILE" 2>/dev/null | sort -rn | head -1 || echo "")
    PEAK_POD_CPU_M=$(jq -r '.pod_cpu_m // 0' "$METRICS_FILE" 2>/dev/null | sort -rn | head -1 || echo "")
    if [[ -n "$PEAK_CPU" ]]; then
      echo "Peak Host CPU: ${PEAK_CPU}%"
    else
      echo "Peak Host CPU: N/A"
    fi
    if [[ -n "$PEAK_MEM_MB" ]]; then
      echo "Peak Host Memory: ${PEAK_MEM_MB} MB / ${MEM_TOTAL_MB} MB (${PEAK_MEM_PCT}%)"
    else
      echo "Peak Host Memory: N/A"
    fi
    if [[ -n "$PEAK_POD_CPU_M" && "$PEAK_POD_CPU_M" != "0" ]]; then
      echo "Peak Pod CPU (sum all pods): ${PEAK_POD_CPU_M}m ($(awk "BEGIN{printf \"%.1f\", ${PEAK_POD_CPU_M}/10}") cores)"
    else
      echo "Peak Pod CPU: N/A (kubectl top may not be available)"
    fi
    if [[ -n "$PEAK_POD_MEM_MB" && "$PEAK_POD_MEM_MB" != "0" ]]; then
      echo "Peak Pod Memory (sum all pods): ${PEAK_POD_MEM_MB} MB"
    else
      echo "Peak Pod Memory: N/A (kubectl top may not be available)"
    fi
    echo ""
    echo "Last 10 measurements:"
    if command -v column >/dev/null 2>&1; then
      tail -10 "$METRICS_FILE" | jq -r '"\(.timestamp)\t\(.cpu_percent)%\t\(.mem_used_mb)/\(.mem_total_mb)MB(\(.mem_percent)%)\tpods CPU:\(.pod_cpu_m // 0)m  MEM:\(.pod_mem_mb // 0)MB"' | column -t -s$'\t'
    else
      echo "(Install 'column' to view table formatting)"
      tail -10 "$METRICS_FILE" | jq -r '"\(.timestamp) HOST_CPU=\(.cpu_percent)% HOST_MEM=\(.mem_used_mb)/\(.mem_total_mb)MB POD_CPU=\(.pod_cpu_m // 0)m POD_MEM=\(.pod_mem_mb // 0)MB"'
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
