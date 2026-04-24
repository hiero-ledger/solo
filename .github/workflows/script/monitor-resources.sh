#!/bin/bash
set -eo pipefail

#
# Resource monitoring script for GitHub Actions runners
# Usage: ./monitor-resources.sh start [interval_seconds]|stop
#   interval_seconds  How often to sample (default: 60, min: 10)
#

METRICS_FILE="${HOME}/.solo/logs/runner-metrics.jsonl"
POD_DETAIL_FILE="${HOME}/.solo/logs/runner-metrics-pods.jsonl"
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

  # Initialize metrics files
  : > "$METRICS_FILE"
  : > "$POD_DETAIL_FILE"

  # Start monitoring in background.
  # Run with +e so a failed command in one sample never kills the loop.
  (
    set +e
    while true; do
      TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")

      # CPU: /proc/stat is reliable on Linux (no grep, no pipefail risk)
      CPU_PERCENT=0
      if [[ -f /proc/stat ]]; then
        CPU_PERCENT=$(awk '/^cpu / {
          idle=$5; total=$2+$3+$4+$5+$6+$7+$8;
          if (total>0) printf "%.1f", 100-(idle/total*100); else printf "0.0"
        }' /proc/stat 2>/dev/null)
        CPU_PERCENT=$(printf '%s' "${CPU_PERCENT:-0}" | tr -d '[:space:]')
      fi

      MEM_INFO=$(free -m 2>/dev/null | grep "^Mem" || true)
      MEM_TOTAL=$(printf '%s' "$(echo "$MEM_INFO" | awk '{print $2}')" | tr -d '[:space:]')
      MEM_USED=$(printf '%s' "$(echo "$MEM_INFO" | awk '{print $3}')" | tr -d '[:space:]')
      MEM_PERCENT=$(printf '%s' "$(echo "$MEM_INFO" | awk '{if ($2>0) printf "%.1f",($3/$2)*100; else printf "0.0"}')" | tr -d '[:space:]')

      # Sum CPU (millicores) and memory (MB) of all running pods across all namespaces.
      # Also build a per-pod JSON array for snapshot reporting at peak memory.
      POD_CPU_M=0
      POD_MEM_MB=0
      POD_DETAIL_JSON="[]"
      if command -v kubectl >/dev/null 2>&1; then
        _pod_raw=$(kubectl top pods --all-namespaces --no-headers 2>/dev/null || true)
        if [[ -n "$_pod_raw" ]]; then
          _pod_stats=$(printf '%s\n' "$_pod_raw" | awk '
            BEGIN { json="[" }
            {
              ns=$1; pod=$2;
              cpu=$3; cval=cpu; sub(/m$/, "", cval);
              if (cpu !~ /m$/) cval=cval*1000;
              cpu_total += cval+0;
              mem=$4; mem_mb=mem;
              if (mem ~ /Gi$/) { sub(/Gi$/, "", mem_mb); mem_mb=mem_mb*1024; }
              else { sub(/Mi$/, "", mem_mb); }
              mem_total += mem_mb+0;
              if (NR > 1) json=json ",";
              json=json sprintf("{\"ns\":\"%s\",\"pod\":\"%s\",\"mem_mb\":%d}", ns, pod, int(mem_mb+0));
            }
            END {
              json=json "]";
              printf "%d %d %s", cpu_total, mem_total, json;
            }
          ' 2>/dev/null || echo "0 0 []")
          POD_CPU_M=$(printf '%s' "${_pod_stats%% *}" | tr -d '[:space:]')
          _pod_rest="${_pod_stats#* }"
          POD_MEM_MB=$(printf '%s' "${_pod_rest%% *}" | tr -d '[:space:]')
          POD_DETAIL_JSON="${_pod_rest#* }"
        fi
      fi
      printf '{"timestamp":"%s","pods":%s}\n' "$TIMESTAMP" "$POD_DETAIL_JSON" >> "$POD_DETAIL_FILE"

      printf '{"timestamp":"%s","cpu_percent":%s,"mem_used_mb":%s,"mem_total_mb":%s,"mem_percent":%s,"pod_mem_mb":%s,"pod_cpu_m":%s}\n' \
        "$TIMESTAMP" \
        "${CPU_PERCENT:-0}" "${MEM_USED:-0}" "${MEM_TOTAL:-0}" "${MEM_PERCENT:-0}" \
        "${POD_MEM_MB:-0}" "${POD_CPU_M:-0}" \
        >> "$METRICS_FILE"
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
