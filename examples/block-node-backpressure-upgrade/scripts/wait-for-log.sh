#!/usr/bin/env bash
# Poll a consensus node's logs until a pattern appears or a timeout elapses.
# We use log assertions because Solo exposes no platform-status primitive
# (PR #25501 takes the same log-based approach for its REAL block-node checks).
#
# IMPORTANT: a consensus node writes its rich logs to FILES under
# /opt/hgcapp/services-hedera/HapiApp2.0/output (block-node-comms.log for
# buffer/back-pressure/acknowledgement lines, swirlds.log for platform-status
# "Now in <STATUS>" lines) — NOT to the pod's stdout. So `kubectl logs` mostly
# misses these; we grep the on-disk files via exec as the primary method.
#
# Usage: wait-for-log.sh <node-label> <namespace> <kube-context> <timeout-secs> <pattern>
#   node-label   - e.g. network-node1 (matches `app=` label on the pod)
#   kube-context - kubectl context (solo switches the current context, so pass
#                  it explicitly)
# Exit: 0 = pattern found, 1 = timed out
set -euo pipefail

NODE_LABEL="${1:?usage: wait-for-log.sh <node-label> <namespace> <kube-context> <timeout-secs> <pattern>}"
NAMESPACE="${2:?missing namespace}"
CTX="${3:?missing kube-context}"
TIMEOUT="${4:?missing timeout-secs}"
PATTERN="${5:?missing pattern}"

K="kubectl --context ${CTX} -n ${NAMESPACE}"
LOG_DIR="/opt/hgcapp/services-hedera/HapiApp2.0/output"

deadline=$(( $(date +%s) + TIMEOUT ))
echo "⏳ ${NODE_LABEL}: waiting (≤${TIMEOUT}s) for \"${PATTERN}\""

while [ "$(date +%s)" -lt "$deadline" ]; do
  pod="$(${K} get pod -l "app=${NODE_LABEL}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  if [ -n "${pod}" ]; then
    # primary: grep the on-disk log files (where the interesting lines actually go)
    if ${K} exec "${pod}" -c root-container -- \
         sh -c "grep -rqF '${PATTERN}' ${LOG_DIR} 2>/dev/null"; then
      echo "✅ ${NODE_LABEL}: found"
      exit 0
    fi
  fi
  # secondary: pod stdout (covers anything that does reach stdout)
  if ${K} logs -l "app=${NODE_LABEL}" --tail=-1 --all-containers=true 2>/dev/null \
       | grep -qF "${PATTERN}"; then
    echo "✅ ${NODE_LABEL}: found"
    exit 0
  fi
  sleep 5
done

echo "❌ ${NODE_LABEL}: timed out after ${TIMEOUT}s waiting for \"${PATTERN}\""
exit 1
