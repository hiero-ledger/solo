#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0

# one-shot-full-delete-cluster-redeploy.sh – run a complete one-shot deploy to success,
# delete the Kind cluster (keeping local config intact), then verify that a subsequent
# re-deploy recovers cleanly by recreating the cluster and redeploying.
#
# Usage:
#   bash .github/workflows/script/one-shot-full-delete-cluster-redeploy.sh
#
# Environment variables (all optional):
#   SOLO_COMMAND     override solo command   (default: "npm run solo --")
#   DEPLOYMENT       deployment name         (default: "one-shot-recover")
#   CLUSTER_NAME     Kind cluster name       (default: "solo-cluster")
#   WAIT_SECONDS     seconds to wait between the delete and the second deploy (default: 5)

set -uo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SOLO_COMMAND="${SOLO_COMMAND:-npm run solo --}"
DEPLOYMENT="${DEPLOYMENT:-one-shot-recover}"
CLUSTER_NAME="${CLUSTER_NAME:-solo-cluster}"
WAIT_SECONDS="${WAIT_SECONDS:-5}"

# Internal state
SECOND_DEPLOY_LOG=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()    { printf '%s  %s\n' "$(date -u '+%H:%M:%S')" "$*"; }
banner() {
  local sep
  sep="$(printf '=%.0s' {1..64})"
  printf '\n%s\n%s\n%s\n\n' "${sep}" "$*" "${sep}"
}

# ---------------------------------------------------------------------------
# Cleanup on exit
# ---------------------------------------------------------------------------
cleanup() {
  local rc=$?
  if [[ -n "${SECOND_DEPLOY_LOG}" && -f "${SECOND_DEPLOY_LOG}" ]]; then
    rm -f "${SECOND_DEPLOY_LOG}"
  fi
  exit "${rc}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Step 1 – run first deploy to completion
# ---------------------------------------------------------------------------
banner "Step 1: running first deploy to completion"

log "Running: ${SOLO_COMMAND} one-shot single deploy --deployment '${DEPLOYMENT}' --quiet-mode"

FIRST_DEPLOY_START=$(date +%s)
set +e
${SOLO_COMMAND} one-shot single deploy --deployment "${DEPLOYMENT}" --quiet-mode
FIRST_RC=$?
set -e
FIRST_DEPLOY_END=$(date +%s)
FIRST_DEPLOY_ELAPSED=$(( FIRST_DEPLOY_END - FIRST_DEPLOY_START ))
log "First deploy finished in ${FIRST_DEPLOY_ELAPSED}s ($(( FIRST_DEPLOY_ELAPSED / 60 ))m $(( FIRST_DEPLOY_ELAPSED % 60 ))s)"

if [[ "${FIRST_RC}" -ne 0 ]]; then
  log "FAIL – first deploy exited with code ${FIRST_RC}. Cannot proceed with recovery test."
  exit "${FIRST_RC}"
fi
log "First deploy succeeded"

# ---------------------------------------------------------------------------
# Step 2 – delete the Kind cluster (local config preserved)
# ---------------------------------------------------------------------------
banner "Step 2: deleting Kind cluster '${CLUSTER_NAME}' (local config preserved)"

log "Deleting cluster …"
kind delete cluster --name "${CLUSTER_NAME}" 2>/dev/null || true
docker rm --force --volumes \
  $(docker ps -aq --filter label=io.x-k8s.kind.cluster="${CLUSTER_NAME}" 2>/dev/null) \
  2>/dev/null || true
log "Cluster deleted"

# ---------------------------------------------------------------------------
# Step 3 – wait, then re-run the deploy (cluster absent, local config present)
# ---------------------------------------------------------------------------
banner "Step 3: waiting ${WAIT_SECONDS}s then redeploying (cluster absent)"
log "Sleeping ${WAIT_SECONDS}s …"
sleep "${WAIT_SECONDS}"

SECOND_DEPLOY_LOG="$(mktemp /tmp/solo-redeploy-XXXXXX.log)"
log "Running second deploy; output captured to ${SECOND_DEPLOY_LOG}"
log "Running: ${SOLO_COMMAND} one-shot single deploy --deployment '${DEPLOYMENT}' --quiet-mode"

SECOND_DEPLOY_START=$(date +%s)
set +e
${SOLO_COMMAND} one-shot single deploy --deployment "${DEPLOYMENT}" --quiet-mode \
  2>&1 | tee "${SECOND_DEPLOY_LOG}"
SECOND_RC=${PIPESTATUS[0]}
set -e
SECOND_DEPLOY_END=$(date +%s)
SECOND_DEPLOY_ELAPSED=$(( SECOND_DEPLOY_END - SECOND_DEPLOY_START ))
log "Step 3 redeployment finished in ${SECOND_DEPLOY_ELAPSED}s ($(( SECOND_DEPLOY_ELAPSED / 60 ))m $(( SECOND_DEPLOY_ELAPSED % 60 ))s)"

# ---------------------------------------------------------------------------
# Step 4 – analyse results
# ---------------------------------------------------------------------------
banner "Step 4: analysing results"

LOCK_ERROR_PATTERN="(Failed to acquire lock|max attempts reached|failed to acquire lock)"
if grep -Eiq "${LOCK_ERROR_PATTERN}" "${SECOND_DEPLOY_LOG}"; then
  log "FAIL – second deploy reported a lock error. Lock recovery did not work."
  log "Matching lines:"
  grep -Ei "${LOCK_ERROR_PATTERN}" "${SECOND_DEPLOY_LOG}" || true
  exit 1
fi

if [[ "${SECOND_RC}" -ne 0 ]]; then
  log "WARN – second deploy exited with code ${SECOND_RC} but no lock error was detected."
  log "The failure may be due to an unrelated issue (network, cluster state, etc.)."
  log "This is treated as a non-lock failure; review the output above for details."
  exit "${SECOND_RC}"
fi

log "PASS – second deploy completed successfully with no lock errors."
exit 0
