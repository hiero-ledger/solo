#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0

# one-shot-interrupt-redeploy.sh – interrupt a one-shot deploy after N seconds,
# then verify that a subsequent re-deploy recovers cleanly without a lock error.
#
# Usage:
#   bash .github/workflows/script/one-shot-interrupt-redeploy.sh [N_SECONDS]
#
# Positional arguments:
#   N_SECONDS   seconds before interrupting the first deploy (default: 60)
#
# Environment variables (all optional):
#   SOLO_COMMAND     override solo command   (default: "npm run solo --")
#   DEPLOYMENT       deployment name         (default: "one-shot-recover")
#   WAIT_SECONDS     seconds to wait between the kill and the second deploy (default: 5)
#   KILL_SIGNAL      signal sent to the first deploy process (default: SIGKILL)

set -uo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
INTERRUPT_SECONDS="${INTERRUPT_SECONDS:-${1:-60}}"
SOLO_COMMAND="${SOLO_COMMAND:-npm run solo --}"
DEPLOYMENT="${DEPLOYMENT:-one-shot-recover}"
WAIT_SECONDS="${WAIT_SECONDS:-5}"
# Use SIGKILL so the process is killed immediately with no graceful-shutdown
# cleanup.  SIGTERM triggers Listr2's shutdown handler which uninstalls any
# Helm releases that were deployed mid-run; SIGKILL leaves them in place so
# the second deploy can reuse them instead of reinstalling from scratch.
KILL_SIGNAL="${KILL_SIGNAL:-SIGKILL}"

# Add a small random jitter (±5 s) so matrix jobs that share a runner do not
# all interrupt at the same deploy phase when the base interval is similar.
JITTER=$(( (RANDOM % 11) - 5 ))
INTERRUPT_SECONDS=$(( INTERRUPT_SECONDS + JITTER ))
# Ensure the adjusted value is at least 10 seconds.
(( INTERRUPT_SECONDS < 10 )) && INTERRUPT_SECONDS=10

# Internal state
FIRST_DEPLOY_PID=""
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
  if [[ -n "${FIRST_DEPLOY_PID}" ]] && kill -0 "${FIRST_DEPLOY_PID}" 2>/dev/null; then
    log "Cleanup: killing first deploy process group (PID ${FIRST_DEPLOY_PID})"
    kill -SIGKILL -- "-${FIRST_DEPLOY_PID}" 2>/dev/null || true
  fi
  if [[ -n "${SECOND_DEPLOY_LOG}" && -f "${SECOND_DEPLOY_LOG}" ]]; then
    rm -f "${SECOND_DEPLOY_LOG}"
  fi
  exit "${rc}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Step 1 – start the first deploy in the background and interrupt it
# ---------------------------------------------------------------------------
banner "Step 1: starting first deploy; will interrupt after ${INTERRUPT_SECONDS}s"

log "Running: ${SOLO_COMMAND} one-shot single deploy --deployment '${DEPLOYMENT}' --quiet-mode"
# Use setsid so the first deploy runs in its own process group; this lets us
# reliably kill the entire process tree (npm wrapper + node grandchild) by
# sending a signal to the process group (kill -- -PGID).
setsid ${SOLO_COMMAND} one-shot single deploy --deployment "${DEPLOYMENT}" --quiet-mode &
FIRST_DEPLOY_PID=$!
log "First deploy started (PID ${FIRST_DEPLOY_PID})"

log "Sleeping ${INTERRUPT_SECONDS}s before interrupting …"
sleep "${INTERRUPT_SECONDS}"

if kill -0 "${FIRST_DEPLOY_PID}" 2>/dev/null; then
  log "Sending ${KILL_SIGNAL} to process group ${FIRST_DEPLOY_PID}"
  # Kill the entire process group so the node grandchild cannot outlive npm
  kill -"${KILL_SIGNAL}" -- "-${FIRST_DEPLOY_PID}" 2>/dev/null || true
  # Give the process group a moment to terminate; escalate to SIGKILL if needed
  sleep 2
  if kill -0 "${FIRST_DEPLOY_PID}" 2>/dev/null; then
    log "Process group still alive; sending SIGKILL"
    kill -SIGKILL -- "-${FIRST_DEPLOY_PID}" 2>/dev/null || true
  fi
  wait "${FIRST_DEPLOY_PID}" 2>/dev/null || true
  log "First deploy process terminated"
else
  log "First deploy process already exited before interrupt"
  wait "${FIRST_DEPLOY_PID}" 2>/dev/null || true
fi
FIRST_DEPLOY_PID=""

# ---------------------------------------------------------------------------
# Step 2 – wait, then re-run the deploy and check for lock errors
# ---------------------------------------------------------------------------
banner "Step 2: waiting ${WAIT_SECONDS}s then redeploying"
log "Sleeping ${WAIT_SECONDS}s …"
sleep "${WAIT_SECONDS}"

SECOND_DEPLOY_LOG="$(mktemp /tmp/solo-redeploy-XXXXXX.log)"
log "Running second deploy; output captured to ${SECOND_DEPLOY_LOG}"
log "Running: ${SOLO_COMMAND} one-shot single deploy --deployment '${DEPLOYMENT}' --quiet-mode"

set +e
${SOLO_COMMAND} one-shot single deploy --deployment "${DEPLOYMENT}" --quiet-mode \
  2>&1 | tee "${SECOND_DEPLOY_LOG}"
SECOND_RC=${PIPESTATUS[0]}
set -e

# ---------------------------------------------------------------------------
# Step 3 – analyse results
# ---------------------------------------------------------------------------
banner "Step 3: analysing results"

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
