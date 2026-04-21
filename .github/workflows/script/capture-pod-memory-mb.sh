#!/bin/bash
set -eo pipefail

#
# Capture peak total pod memory (MB) across all namespaces via kubectl top.
# Takes several samples and prints the highest observed value to stdout.
# Usage: ./capture-pod-memory-mb.sh [samples=3] [interval_seconds=10]
#
# Requires metrics-server to be installed and serving (see install-metrics-server.sh).
#

SAMPLES="${1:-3}"
INTERVAL="${2:-10}"
MAX=0

for i in $(seq 1 "$SAMPLES"); do
  VAL=$(kubectl top pods --all-namespaces --no-headers 2>/dev/null | awk '
    {
      mem = $4
      if (mem ~ /Gi$/) { sub(/Gi$/, "", mem); mem = mem * 1024 }
      else              { sub(/Mi$/, "", mem) }
      total += mem + 0
    }
    END { print int(total + 0) }
  ' || echo "0")
  VAL="${VAL:-0}"
  [[ "$VAL" -gt "$MAX" ]] && MAX="$VAL"
  [[ "$i" -lt "$SAMPLES" ]] && sleep "$INTERVAL"
done

echo "$MAX"
