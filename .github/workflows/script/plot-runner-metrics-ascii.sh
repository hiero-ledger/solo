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
POD_DETAIL_FILE="${METRICS_FILE%.jsonl}-pods.jsonl"

if [[ ! -f "$METRICS_FILE" ]]; then
  echo "Error: metrics file not found: $METRICS_FILE" >&2
  exit 1
fi

# Extract CPU percentages, host memory MB values, pod memory MB and pod CPU millicores
CPU_VALUES=$(jq -r '.cpu_percent // empty' "$METRICS_FILE" 2>/dev/null || echo "")
MEM_MB_VALUES=$(jq -r '.mem_used_mb // empty' "$METRICS_FILE" 2>/dev/null || echo "")
MEM_TOTAL_MB=$(jq -r '.mem_total_mb // empty' "$METRICS_FILE" 2>/dev/null | tail -1 || echo "")
POD_MEM_VALUES=$(jq -r '.pod_mem_mb // empty' "$METRICS_FILE" 2>/dev/null || echo "")
POD_CPU_VALUES=$(jq -r '.pod_cpu_m // empty' "$METRICS_FILE" 2>/dev/null || echo "")
# Fall back to percentage if MB data is absent (older metrics files)
MEM_VALUES=$(jq -r '.mem_percent // empty' "$METRICS_FILE" 2>/dev/null || echo "")

NUM_POINTS=$(printf '%s\n' "$CPU_VALUES" | awk 'NF' | wc -l | tr -d ' ')

if [[ -z "$CPU_VALUES" || "$NUM_POINTS" -eq 0 ]]; then
  echo "Warning: No valid data found in metrics file (file may be empty or not yet written)" >&2
  exit 0
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

  # Reusable awk program for a dynamic-Y MB chart
  _mb_chart() {
    local values="$1" max_val="$2" label="$3"
    printf '%s\n' "$values" | awk -v height=10 -v width=50 -v max_val="$max_val" -v lbl="$label" '
      { v=$1+0; if(v<0)v=0; vals[n]=v; n++ }
      END {
        if(n==0) exit 0;
        if(max_val<=0) max_val=1;
        for(i=0;i<n;i++) norm[i]=int((vals[i]/max_val)*height);
        w=(n<width?n:width);
        for(y=height;y>=0;y--) {
          printf "%6d %s |", int((y/height)*max_val), lbl;
          for(x=0;x<w;x++) {
            if(norm[x]>=y) printf "#";
            else if(norm[x]==y-1) printf "+";
            else printf " ";
          }
          print "";
        }
        printf "            +";
        for(x=0;x<w;x++) printf "-";
        print "";
      }'
  }

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

  # Host memory chart — Y-axis in MB when available, percentage otherwise
  if [[ "$mem_y_unit" == "MB" ]]; then
    mem_chart=$(_mb_chart "$mem_chart_values" "${mem_max:-1}" "MB")
  else
    mem_chart=$(printf '%s\n' "$mem_chart_values" | awk -v height=10 -v width=50 -v max_val=100 '
      { v=$1+0; if(v<0)v=0; if(v>max_val)v=max_val; vals[n]=v; n++ }
      END {
        if(n==0) exit 0;
        for(i=0;i<n;i++) norm[i]=int((vals[i]/max_val)*height);
        w=(n<width?n:width);
        for(y=height;y>=0;y--) {
          printf "%5.1f%% |", (y/height)*max_val;
          for(x=0;x<w;x++) {
            if(norm[x]>=y) printf "#";
            else if(norm[x]==y-1) printf "+";
            else printf " ";
          }
          print "";
        }
        printf "       +";
        for(x=0;x<w;x++) printf "-";
        print "";
      }')
  fi

  # Pod memory chart — dynamic Y-axis capped at peak pod memory
  pod_mem_chart=""
  peak_pod_mem_mb=""
  if [[ -n "$POD_MEM_VALUES" ]] && printf '%s\n' "$POD_MEM_VALUES" | grep -qE '^[0-9]+'; then
    peak_pod_mem_mb=$(printf '%s\n' "$POD_MEM_VALUES" | sort -nr | head -1)
    pod_mem_chart=$(_mb_chart "$POD_MEM_VALUES" "${peak_pod_mem_mb:-1}" "MB")
  fi

  # Pod CPU chart — Y-axis in millicores, capped at peak pod CPU
  pod_cpu_chart=""
  peak_pod_cpu_m=""
  if [[ -n "$POD_CPU_VALUES" ]] && printf '%s\n' "$POD_CPU_VALUES" | grep -qE '^[0-9]+'; then
    peak_pod_cpu_m=$(printf '%s\n' "$POD_CPU_VALUES" | sort -nr | head -1)
    pod_cpu_chart=$(_mb_chart "$POD_CPU_VALUES" "${peak_pod_cpu_m:-1}" " m")
  fi

  # Per-pod memory snapshot at the data point where total pod memory is highest
  peak_pod_snapshot=""
  peak_pod_snapshot_all=""
  peak_pod_snapshot_ts=""
  if [[ -f "$POD_DETAIL_FILE" ]] && [[ -n "$POD_MEM_VALUES" ]] && printf '%s\n' "$POD_MEM_VALUES" | grep -qE '^[0-9]+'; then
    peak_pod_snapshot_ts=$(jq -rs 'max_by(.pods | map(.mem_mb) | add // 0) | .timestamp' "$POD_DETAIL_FILE" 2>/dev/null || echo "")
    if [[ -n "$peak_pod_snapshot_ts" ]]; then
      peak_pod_snapshot_all=$(jq -r --arg ts "$peak_pod_snapshot_ts" \
        'select(.timestamp == $ts) | .pods[] | [.mem_mb, (.ns + "/" + .pod)] | @tsv' \
        "$POD_DETAIL_FILE" 2>/dev/null \
        | sort -rn || echo "")
      peak_pod_snapshot=$(printf '%s\n' "$peak_pod_snapshot_all" | head -30)
    fi
  fi

  # Category aggregation — uses full (untruncated) pod list
  # Excludes from total/category summary:
  # - metallb-system namespace
  # - network-load-generator pods
  # - metrics-server pods
  # Categories:
  #   mirror   — mirror-* pods + solo-shared-resources-postgres/redis
  #   relay    — relay* pods (relay, relay-ws)
  #   block    — block-node* pods
  #   network  — network-node* + haproxy* + envoy-proxy* + minio-pool*
  #   kube     — kube-system namespace
  cat_mirror=0; cat_relay=0; cat_block=0; cat_network=0; cat_kube=0; cat_total=0
  if [[ -n "$peak_pod_snapshot_all" ]]; then
    while IFS=$'\t' read -r _mem _ns_pod; do
      [[ -z "$_mem" || -z "$_ns_pod" ]] && continue
      _ns="${_ns_pod%%/*}"
      _pod="${_ns_pod#*/}"
      # Strip trailing pod hash suffixes for pattern matching but keep original label
      [[ "$_ns" == "metallb-system" ]] && continue
      [[ "$_pod" == network-load-generator* ]] && continue
      [[ "$_pod" == metrics-server* ]] && continue
      _mem="${_mem//[^0-9]/}"
      [[ -z "$_mem" ]] && continue
      cat_total=$((cat_total + _mem))
      if [[ "$_pod" == mirror-* || "$_pod" == solo-shared-resources-postgres* || "$_pod" == solo-shared-resources-redis* ]]; then
        cat_mirror=$((cat_mirror + _mem))
      elif [[ "$_pod" == relay* ]]; then
        cat_relay=$((cat_relay + _mem))
      elif [[ "$_pod" == block-node* ]]; then
        cat_block=$((cat_block + _mem))
      elif [[ "$_pod" == network-node* || "$_pod" == haproxy* || "$_pod" == envoy-proxy* || "$_pod" == minio-pool* ]]; then
        cat_network=$((cat_network + _mem))
      elif [[ "$_ns" == "kube-system" ]]; then
        cat_kube=$((cat_kube + _mem))
      fi
    done < <(printf '%s\n' "$peak_pod_snapshot_all")
  fi

  # Build category summary table (ASCII) and mermaid pie chart
  cat_table=""
  mermaid_chart=""
  if [[ "$cat_total" -gt 0 ]]; then
    cat_table=$(awk \
      -v mirror="$cat_mirror" -v relay="$cat_relay" -v block="$cat_block" \
      -v network="$cat_network" -v kube="$cat_kube" -v total="$cat_total" \
      'BEGIN {
        n = 5
        labels[0] = "Mirror Node (+ postgres/redis)"
        labels[1] = "Relay (relay + relay-ws)"
        labels[2] = "Block Node"
        labels[3] = "Network Node (+ haproxy/envoy/minio)"
        labels[4] = "kube-system"
        vals[0] = mirror+0; vals[1] = relay+0; vals[2] = block+0
        vals[3] = network+0; vals[4] = kube+0
        sep  = "────────────────────────────────────────"
        fmt  = "%-40s %10s  %7s\n"
        printf fmt, "Category", "Memory (MB)", "Share"
        printf fmt, sep, "──────────", "───────"
        for (i = 0; i < n; i++) {
          pct = (total > 0) ? vals[i] / total * 100 : 0
          printf "%-40s %10d  %6.1f%%\n", labels[i], vals[i], pct
        }
        printf fmt, sep, "──────────", "───────"
        printf "%-40s %10d  %6s\n", "Total (excl. load-gen/metallb)", total, "100.0%"
      }' /dev/null)

    # pie1-pie5 map in order to: Mirror, Relay, Block, Network, kube-system
    # Colors: blue, orange, red, emerald, violet — clearly distinct
    mermaid_chart='```mermaid'$'\n'
    mermaid_chart+="%%{init: {\"themeVariables\": {\"pie1\": \"#3B82F6\", \"pie2\": \"#F97316\", \"pie3\": \"#EF4444\", \"pie4\": \"#10B981\", \"pie5\": \"#8B5CF6\"}}}%%"$'\n'
    mermaid_chart+="pie title Peak Pod Memory by Category"$'\n'
    [[ "$cat_mirror"  -gt 0 ]] && mermaid_chart+="    \"Mirror Node\" : ${cat_mirror}"$'\n'
    [[ "$cat_relay"   -gt 0 ]] && mermaid_chart+="    \"Relay\" : ${cat_relay}"$'\n'
    [[ "$cat_block"   -gt 0 ]] && mermaid_chart+="    \"Block Node\" : ${cat_block}"$'\n'
    [[ "$cat_network" -gt 0 ]] && mermaid_chart+="    \"Network Node\" : ${cat_network}"$'\n'
    [[ "$cat_kube"    -gt 0 ]] && mermaid_chart+="    \"kube-system\" : ${cat_kube}"$'\n'
    mermaid_chart+='```'
  fi

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
  ASCII+="📉 Host Memory Usage (MB)"$'\n'
  ASCII+="$mem_chart"$'\n'
  ASCII+=$'\n'
  if [[ -n "$pod_cpu_chart" ]]; then
    ASCII+="⚙️  Pod CPU Usage — sum of all containers (millicores)"$'\n'
    ASCII+="$pod_cpu_chart"$'\n'
    ASCII+=$'\n'
  fi
  if [[ -n "$pod_mem_chart" ]]; then
    ASCII+="📦 Pod Memory Usage — sum of all containers (MB)"$'\n'
    ASCII+="$pod_mem_chart"$'\n'
    ASCII+=$'\n'
  fi

  if [[ -n "$peak_pod_snapshot" ]]; then
    ASCII+="🔍 Per-Pod Memory at Peak Cluster Usage (${peak_pod_snapshot_ts})"$'\n'
    ASCII+="────────────────────────────────────────────────────"$'\n'
    ASCII+="$(printf '%s\n' "$peak_pod_snapshot" | awk -F'\t' '{printf "   %6d MB  %s\n", $1, $2}')"$'\n'
    ASCII+="────────────────────────────────────────────────────"$'\n'
    ASCII+="   Total: ${peak_pod_mem_mb} MB"$'\n'
    ASCII+=$'\n'
  fi

  if [[ -n "$cat_table" ]]; then
    ASCII+="📊 Pod Memory by Category at Peak"$'\n'
    ASCII+="$cat_table"$'\n'
    ASCII+=$'\n'
  fi

  if [[ "$OVER_95" -eq 1 ]]; then
    ASCII+="⚠️  WARNING: Resource usage exceeded 95% threshold!"$'\n'
    ASCII+="    Host CPU Peak: ${peak_cpu}%  |  Host Memory Peak: ${mem_label}"$'\n'
  elif [[ "$OVER_80" -eq 1 ]]; then
    ASCII+="⚡ NOTICE: Resource usage exceeded 80% threshold"$'\n'
    ASCII+="    Host CPU Peak: ${peak_cpu}%  |  Host Memory Peak: ${mem_label}"$'\n'
  else
    ASCII+="✅ Resource usage within normal limits"$'\n'
    ASCII+="    Host CPU Peak: ${peak_cpu}%  |  Host Memory Peak: ${mem_label}"$'\n'
  fi
  if [[ -n "$peak_pod_cpu_m" ]]; then
    ASCII+="    Pod CPU Peak: ${peak_pod_cpu_m}m (sum of all containers)"$'\n'
  fi
  if [[ -n "$peak_pod_mem_mb" ]]; then
    ASCII+="    Pod Memory Peak: ${peak_pod_mem_mb} MB (sum of all containers)"$'\n'
  fi
  ASCII+=$'\n'
fi

printf '%s
' "$ASCII"

if [[ -n "$OUTPUT_FILE" ]]; then
  printf '%s\n' "$ASCII" > "$OUTPUT_FILE"
  echo "ASCII chart saved to: $OUTPUT_FILE" >&2

  if [[ -n "$mermaid_chart" ]]; then
    MERMAID_FILE="${OUTPUT_FILE%.txt}-mermaid.md"
    printf '%s\n' "$mermaid_chart" > "$MERMAID_FILE"
    echo "Mermaid chart saved to: $MERMAID_FILE" >&2
  fi

  if [[ -n "$cat_table" ]]; then
    CATEGORIES_FILE="${OUTPUT_FILE%.txt}-categories.txt"
    printf '%s\n' "$cat_table" > "$CATEGORIES_FILE"
    echo "Category table saved to: $CATEGORIES_FILE" >&2
  fi
fi
