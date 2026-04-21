#!/bin/bash
set -eo pipefail

#
# Capture a single kubectl-top-pods snapshot and append it to the monitoring
# JSONL files so the chart generator has real per-pod data even when the
# background monitor happened not to poll during the live-pods window.
#
# Usage: ./inject-pod-snapshot.sh
#
# Writes to:
#   $HOME/.solo/logs/runner-metrics.jsonl       (pod_mem_mb / pod_cpu_m fields)
#   $HOME/.solo/logs/runner-metrics-pods.jsonl  (per-pod detail array)
#

METRICS_FILE="${HOME}/.solo/logs/runner-metrics.jsonl"
POD_DETAIL_FILE="${HOME}/.solo/logs/runner-metrics-pods.jsonl"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")

_pod_raw=$(kubectl top pods --all-namespaces --no-headers 2>/dev/null || true)
if [[ -z "$_pod_raw" ]]; then
  echo "inject-pod-snapshot: no pod data (metrics-server may not be serving yet)"
  exit 0
fi

_pod_stats=$(printf '%s\n' "$_pod_raw" | awk '
  BEGIN { json = "[" }
  {
    ns  = $1; pod = $2
    cpu = $3; cval = cpu; sub(/m$/, "", cval)
    if (cpu !~ /m$/) cval = cval * 1000
    cpu_total += cval + 0

    mem = $4; mem_mb = mem
    if (mem ~ /Gi$/) { sub(/Gi$/, "", mem_mb); mem_mb = mem_mb * 1024 }
    else              { sub(/Mi$/, "",  mem_mb) }
    mem_total += mem_mb + 0

    if (NR > 1) json = json ","
    json = json sprintf("{\"ns\":\"%s\",\"pod\":\"%s\",\"mem_mb\":%d}", ns, pod, int(mem_mb + 0))
  }
  END {
    json = json "]"
    printf "%d %d %s", cpu_total, mem_total, json
  }
')

POD_CPU_M="${_pod_stats%% *}"
_rest="${_pod_stats#* }"
POD_MEM_MB="${_rest%% *}"
POD_DETAIL_JSON="${_rest#* }"

printf '{"timestamp":"%s","pods":%s}\n' \
  "$TIMESTAMP" "$POD_DETAIL_JSON" >> "$POD_DETAIL_FILE"

# cpu_percent / mem_used_mb are left as 0 so they don't skew the host-resource
# peak tracked by the background monitor; only the pod fields are meaningful here.
printf '{"timestamp":"%s","cpu_percent":0,"mem_used_mb":0,"mem_total_mb":0,"mem_percent":0,"pod_mem_mb":%s,"pod_cpu_m":%s}\n' \
  "$TIMESTAMP" "$POD_MEM_MB" "$POD_CPU_M" >> "$METRICS_FILE"

echo "inject-pod-snapshot: pod_mem=${POD_MEM_MB} MB  pod_cpu=${POD_CPU_M}m  (${TIMESTAMP})"
