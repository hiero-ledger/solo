#!/usr/bin/env bash
# Compare two port snapshots taken by capture-ports.sh and render a verdict.
# This is the heart of the port-reassignment check: after an upgrade the
# consensus nodes and their block nodes SHOULD keep the same addressing.
#
# Usage: diff-ports.sh <baseline-label> <other-label>
# Exit:  0 = ports stable, 3 = ports changed (repro of the reported behavior)
set -euo pipefail

A_LABEL="${1:?usage: diff-ports.sh <baseline-label> <other-label>}"
B_LABEL="${2:?usage: diff-ports.sh <baseline-label> <other-label>}"
A="/tmp/bn-bp-ports-${A_LABEL}.txt"
B="/tmp/bn-bp-ports-${B_LABEL}.txt"

[ -f "$A" ] || { echo "missing snapshot: $A (run capture-ports.sh ${A_LABEL} first)"; exit 1; }
[ -f "$B" ] || { echo "missing snapshot: $B (run capture-ports.sh ${B_LABEL} first)"; exit 1; }

# Ignore the snapshot header line (it embeds the label, so it always differs);
# compare only the addressing data.
strip() { grep -v '^# port snapshot:' "$1"; }
if d=$(diff <(strip "$A") <(strip "$B")); then
  echo "✅ PORTS STABLE — no addressing change (${A_LABEL} -> ${B_LABEL})"
  exit 0
else
  echo "⚠️  PORTS CHANGED — addressing reassigned (${A_LABEL} -> ${B_LABEL}); reproduces the test-client behavior:"
  echo "$d" | grep -E '^[<>]' | sed 's/^/    /'
  exit 3
fi
