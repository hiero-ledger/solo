#!/usr/bin/env bash
set -euo pipefail

# Generate ASCII chart for runner resource metrics from JSONL file.
# Usage:
#   ./plot-runner-metrics-ascii.sh <metrics-jsonl-file> [output-file]

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <metrics-jsonl-file> [output-file]" >&2
  exit 1
fi

METRICS_FILE="$1"
OUTPUT_FILE="${2:-}"

if [[ ! -f "$METRICS_FILE" ]]; then
  echo "Error: metrics file not found: $METRICS_FILE" >&2
  exit 1
fi

# Extract CPU percentages and memory MB values (portable to macOS Bash 3)
CPU_VALUES=$(jq -r '.cpu_percent // empty' "$METRICS_FILE" 2>/dev/null || echo "")
MEM_MB_VALUES=$(jq -r '.mem_used_mb // empty' "$METRICS_FILE" 2>/dev/null || echo "")
MEM_TOTAL_MB=$(jq -r '.mem_total_mb // empty' "$METRICS_FILE" 2>/dev/null | tail -1 || echo "")
# Fall back to percentage if MB data is absent (older metrics files)
MEM_VALUES=$(jq -r '.mem_percent // empty' "$METRICS_FILE" 2>/dev/null || echo "")

NUM_POINTS=$(printf '%s\n' "$CPU_VALUES" | awk 'NF' | wc -l | tr -d ' ')

if [[ -z "$CPU_VALUES" || "$NUM_POINTS" -eq 0 ]]; then
  ASCII="Error: No valid data found in metrics file"
else
  # Approximate duration using actual timestamps when possible; fall back to
  # interval-based calculation if jq timestamp parsing is unavailable.
  FIRST_TS=$(jq -r 'first(inputs,.)|.timestamp' "$METRICS_FILE" 2>/dev/null | head -1 || echo "")
  LAST_TS=$(jq -r '.timestamp' "$METRICS_FILE" 2>/dev/null | tail -1 || echo "")
  if [[ -n "$FIRST_TS" && -n "$LAST_TS" && "$FIRST_TS" != "$LAST_TS" ]]; then
    DURATION_SEC=$(( $(date -d "$LAST_TS" +%s 2>/dev/null || echo 0) - $(date -d "$FIRST_TS" +%s 2>/dev/null || echo 0) ))
    DURATION_MIN=$(awk "BEGIN{printf \"%.1f\", ${DURATION_SEC}/60}")
  elif (( NUM_POINTS > 1 )); then
    # Infer interval from the metrics file name convention or default to 60s
    DURATION_MIN=$(( NUM_POINTS - 1 ))
  else
    DURATION_MIN=0
  fi

  # Peak values
  peak_cpu=$(printf '%s\n' "$CPU_VALUES" | sort -nr | head -1)
  peak_mem_pct=$(printf '%s\n' "$MEM_VALUES" | sort -nr | head -1)
  # Use MB data when available; fall back to percentage label
  if [[ -n "$MEM_MB_VALUES" ]] && printf '%s\n' "$MEM_MB_VALUES" | grep -qE '^[0-9]+'; then
    peak_mem_mb=$(printf '%s\n' "$MEM_MB_VALUES" | sort -nr | head -1)
    mem_label="${peak_mem_mb} MB / ${MEM_TOTAL_MB} MB (${peak_mem_pct}%)"
    mem_chart_values="$MEM_MB_VALUES"
    mem_max="${MEM_TOTAL_MB:-$(printf '%s\n' "$MEM_MB_VALUES" | sort -nr | head -1)}"
    mem_y_unit="MB"
  else
    peak_mem_mb=""
    mem_label="${peak_mem_pct}%"
    mem_chart_values="$MEM_VALUES"
    mem_max=100
    mem_y_unit="%"
  fi

  # Build detailed ASCII charts for CPU and Memory (similar to Python version)
  cpu_chart=$(printf '%s\n' "$CPU_VALUES" | awk -v height=10 -v width=50 -v max_val=100 '
    {
      v = $1+0;
      if (v < 0) v = 0;
      if (v > max_val) v = max_val;
      vals[n] = v;
      n++;
    }
    END {
      if (n == 0) {
        exit 0;
      }

      # Normalize values to chart height
      for (i = 0; i < n; i++) {
        norm[i] = int((vals[i] / max_val) * height);
      }

      w = (n < width ? n : width);

      # Y-axis labels and chart
      for (y = height; y >= 0; y--) {
        percent = (y / height) * max_val;
        printf "%5.1f%% |", percent;
        for (x = 0; x < w; x++) {
          if (norm[x] >= y) {
            printf "#";
          } else if (norm[x] == y - 1) {
            printf "+";
          } else {
            printf " ";
          }
        }
        print "";
      }

      # X-axis
      printf "       +";
      for (x = 0; x < w; x++) {
        printf "-";
      }
      print "";
    }')

  # Memory chart — Y-axis in MB when available, percentage otherwise
  mem_chart=$(printf '%s\n' "$mem_chart_values" | awk -v height=10 -v width=50 -v max_val="$mem_max" -v unit="$mem_y_unit" '
    {
      v = $1+0;
      if (v < 0) v = 0;
      if (max_val > 0 && v > max_val) v = max_val;
      vals[n] = v;
      n++;
    }
    END {
      if (n == 0) {
        exit 0;
      }

      if (max_val <= 0) max_val = 1;

      # Normalize values to chart height
      for (i = 0; i < n; i++) {
        norm[i] = int((vals[i] / max_val) * height);
      }

      w = (n < width ? n : width);

      # Y-axis labels and chart
      for (y = height; y >= 0; y--) {
        label = (y / height) * max_val;
        if (unit == "MB") {
          printf "%6d MB |", int(label);
        } else {
          printf "%5.1f%% |", label;
        }
        for (x = 0; x < w; x++) {
          if (norm[x] >= y) {
            printf "#";
          } else if (norm[x] == y - 1) {
            printf "+";
          } else {
            printf " ";
          }
        }
        print "";
      }

      # X-axis
      printf "          +";
      for (x = 0; x < w; x++) {
        printf "-";
      }
      print "";
    }')

  # Threshold checks (CPU only; memory uses absolute MB threshold if available)
  OVER_95=$(awk -v c="$peak_cpu" -v m="$peak_mem_pct" 'BEGIN{max=c+0; if(m+0>max)max=m+0; if(max>95)print 1; else print 0}')
  OVER_80=$(awk -v c="$peak_cpu" -v m="$peak_mem_pct" 'BEGIN{max=c+0; if(m+0>max)max=m+0; if(max>80)print 1; else print 0}')

  ASCII=$'\n'
  ASCII+="╔═══════════════════════════════════════════════════════════════╗"$'\n'
  ASCII+="║          GitHub Runner Resource Usage                         ║"$'\n'
  ASCII+="╚═══════════════════════════════════════════════════════════════╝"$'\n'
  ASCII+=$'\n'
  ASCII+="⏱️  Test Duration: ${DURATION_MIN}.0 minutes (${NUM_POINTS} data points)"$'\n'
  ASCII+=$'\n'
  ASCII+="📉 CPU Usage"$'\n'
  ASCII+="$cpu_chart"$'\n'
  ASCII+=$'\n'
  ASCII+="📉 Memory Usage (MB)"$'\n'
  ASCII+="$mem_chart"$'\n'
  ASCII+=$'\n'

  if [[ "$OVER_95" -eq 1 ]]; then
    ASCII+="⚠️  WARNING: Resource usage exceeded 95% threshold!"$'\n'
    ASCII+="    CPU Peak: ${peak_cpu}%  |  Memory Peak: ${mem_label}"$'\n'
  elif [[ "$OVER_80" -eq 1 ]]; then
    ASCII+="⚡ NOTICE: Resource usage exceeded 80% threshold"$'\n'
    ASCII+="    CPU Peak: ${peak_cpu}%  |  Memory Peak: ${mem_label}"$'\n'
  else
    ASCII+="✅ Resource usage within normal limits"$'\n'
    ASCII+="    CPU Peak: ${peak_cpu}%  |  Memory Peak: ${mem_label}"$'\n'
  fi
  ASCII+=$'\n'
fi

printf '%s
' "$ASCII"

if [[ -n "$OUTPUT_FILE" ]]; then
  printf '%s
' "$ASCII" > "$OUTPUT_FILE"
  echo "ASCII chart saved to: $OUTPUT_FILE" >&2
fi
