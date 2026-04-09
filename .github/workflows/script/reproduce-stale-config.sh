#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
#
# Reproduces and verifies the fix for the stale local-config issue:
#   "Solo local state becomes out-of-sync when users manually clean up Docker/Kubernetes resources"
#
# Steps:
#   1. Deploy a one-shot network (creates local config + Kind cluster + solo resources)
#   2. Manually delete the Kind cluster (simulates user running `kind delete cluster` or
#      `docker system prune`, etc.)
#   3. Re-deploy the one-shot network
#      - EXPECTED: Solo detects the stale local config, logs a warning, cleans it up, and
#                  proceeds with a fresh deployment instead of failing with
#                  "A deployment named one-shot already exists."
#   4. Verify that the expected stale-config message appeared in the output
#   5. Destroy the deployment (cleanup)
#
# Usage (from the root of the solo repository):
#   .github/workflows/script/reproduce-stale-config.sh
#
# Environment variables (all optional):
#   SOLO_CMD         - Solo command to use (default: "npm run solo --")
#   SOLO_DEPLOYMENT  - Deployment name        (default: "one-shot")
#   SOLO_CLUSTER     - Kind cluster name      (default: "solo-cluster")
#   SKIP_CLEANUP     - Set to "true" to skip the final destroy step (default: unset)

set -eo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SOLO_CMD="${SOLO_CMD:-npm run solo --}"
SOLO_DEPLOYMENT="${SOLO_DEPLOYMENT:-one-shot}"
SOLO_CLUSTER="${SOLO_CLUSTER:-solo-cluster}"

EXPECTED_MSG="no matching resources were found in the cluster"
REDEPLOY_LOG="$(mktemp /tmp/solo-stale-config-redeploy-XXXX.log)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
step() {
  echo ""
  echo "============================================================"
  echo "  $*"
  echo "============================================================"
}

cleanup() {
  local rc=$?
  rm -f "${REDEPLOY_LOG}"
  if [[ ${rc} -ne 0 ]]; then
    echo ""
    echo "Script FAILED (exit code ${rc})"
    if [[ -s "${REDEPLOY_LOG}" ]]; then
      echo "--- redeploy output ---"
      cat "${REDEPLOY_LOG}" || true
      echo "--- end redeploy output ---"
    fi
  fi
  exit "${rc}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Step 1 – Initial deployment
# ---------------------------------------------------------------------------
step "Step 1: Deploy one-shot network (deployment='${SOLO_DEPLOYMENT}')"
${SOLO_CMD} one-shot single deploy \
  --deployment "${SOLO_DEPLOYMENT}" \
  --quiet-mode \
  --no-rollback

echo "Step 1 complete: one-shot network deployed successfully."

# ---------------------------------------------------------------------------
# Step 2 – Simulate manual cluster deletion (reproduces the issue)
# ---------------------------------------------------------------------------
step "Step 2: Delete Kind cluster '${SOLO_CLUSTER}' (simulating manual user cleanup)"
if ! command -v kind &>/dev/null; then
  echo "ERROR: 'kind' not found in PATH. Cannot delete cluster."
  exit 1
fi

kind delete cluster --name "${SOLO_CLUSTER}"
echo "Step 2 complete: Kind cluster '${SOLO_CLUSTER}' deleted."
echo "  Solo's local config still references deployment '${SOLO_DEPLOYMENT}' — it is now STALE."

# ---------------------------------------------------------------------------
# Step 3 – Re-deploy (should detect stale config and proceed)
# ---------------------------------------------------------------------------
step "Step 3: Re-deploy one-shot network (should detect stale local config)"

# Capture combined stdout+stderr so we can grep for the expected message.
# Also tee to terminal so CI logs remain readable.
set +e
${SOLO_CMD} one-shot single deploy \
  --deployment "${SOLO_DEPLOYMENT}" \
  --quiet-mode 2>&1 | tee "${REDEPLOY_LOG}"
REDEPLOY_EXIT=${PIPESTATUS[0]}
set -e

# ---------------------------------------------------------------------------
# Step 4 – Verify the stale-config warning appeared
# ---------------------------------------------------------------------------
step "Step 4: Verify stale-config detection message"

if grep -q "${EXPECTED_MSG}" "${REDEPLOY_LOG}"; then
  echo "✅  Stale config detection is working correctly."
  echo "    Found expected message: \"${EXPECTED_MSG}\""
else
  echo "❌  Expected stale-config message NOT found in redeploy output."
  echo "    Searched for: \"${EXPECTED_MSG}\""
  echo "    This means the fix is not active or the message changed."
  exit 1
fi

if [[ ${REDEPLOY_EXIT} -ne 0 ]]; then
  echo "❌  Re-deployment exited with code ${REDEPLOY_EXIT} (expected 0)."
  exit "${REDEPLOY_EXIT}"
fi

echo "✅  Re-deployment succeeded after stale config cleanup."

# ---------------------------------------------------------------------------
# Step 5 – Cleanup (optional)
# ---------------------------------------------------------------------------
if [[ "${SKIP_CLEANUP:-false}" != "true" ]]; then
  step "Step 5: Cleanup — destroy one-shot deployment"
  ${SOLO_CMD} one-shot single destroy \
    --deployment "${SOLO_DEPLOYMENT}" \
    --quiet-mode || true
  echo "Step 5 complete: deployment destroyed."
else
  echo "Step 5 skipped (SKIP_CLEANUP=true)."
fi

echo ""
echo "============================================================"
echo "  All steps passed. Stale config fix verified successfully."
echo "============================================================"
