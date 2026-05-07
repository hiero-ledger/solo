#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# verify-one-shot-versions.sh
#
# Compares the component versions stored in the solo-remote-config ConfigMap
# against the versions reported by `solo one-shot show deployment`.
#
# Usage:
#   ./resources/verify-one-shot-versions.sh [NAMESPACE] [DEPLOYMENT]
#
# If NAMESPACE is omitted, defaults to "solo" (or the value of $SOLO_NAMESPACE).
# If DEPLOYMENT is omitted, the solo CLI auto-detects the cached deployment.
#
# Prerequisites:
#   - kubectl configured to the target cluster context
#   - npm dependencies installed (npm install)

set -euo pipefail

NAMESPACE="${1:-${SOLO_NAMESPACE:-solo}}"
DEPLOYMENT="${2:-}"

echo "============================================"
echo "  One-Shot Version Verification"
echo "  Namespace : ${NAMESPACE}"
echo "  Deployment: ${DEPLOYMENT:-<auto-detect>}"
echo "============================================"
echo ""

# ── Step 1: Read versions directly from the ConfigMap ──────────────────────
echo "--- ConfigMap (solo-remote-config) versions ---"
CONFIGMAP_JSON=$(kubectl get configmap solo-remote-config \
  -n "${NAMESPACE}" \
  -o jsonpath='{.data.remote-config-data}' 2>/dev/null) || {
  echo "ERROR: Could not read ConfigMap 'solo-remote-config' in namespace '${NAMESPACE}'."
  echo "       Ensure kubectl is configured and the deployment namespace is correct."
  exit 1
}

# Extract version fields from the YAML blob using grep + awk (no yq required)
extract_version() {
  local key="$1"
  echo "${CONFIGMAP_JSON}" | grep -A1 "^versions:" | grep "${key}:" | awk '{print $2}' | tr -d '"'
}

# Parse using a simple sed pipeline that works without yq
VERSIONS_BLOCK=$(echo "${CONFIGMAP_JSON}" | sed -n '/^versions:/,/^[^ ]/p' | head -n -1)

CM_CHART=$(echo "${VERSIONS_BLOCK}"        | grep '^\s*chart:'        | awk '{print $2}')
CM_CONSENSUS=$(echo "${VERSIONS_BLOCK}"    | grep '^\s*consensusNode:' | awk '{print $2}')
CM_MIRROR=$(echo "${VERSIONS_BLOCK}"       | grep '^\s*mirrorNodeChart:' | awk '{print $2}')
CM_EXPLORER=$(echo "${VERSIONS_BLOCK}"     | grep '^\s*explorerChart:' | awk '{print $2}')
CM_RELAY=$(echo "${VERSIONS_BLOCK}"        | grep '^\s*jsonRpcRelayChart:' | awk '{print $2}')
CM_BLOCKNODE=$(echo "${VERSIONS_BLOCK}"    | grep '^\s*blockNodeChart:' | awk '{print $2}')

echo "  Solo Chart Version      : ${CM_CHART:-<not set>}"
echo "  Consensus Node Version  : ${CM_CONSENSUS:-<not set>}"
echo "  Mirror Node Version     : ${CM_MIRROR:-<not set>}"
echo "  Explorer Version        : ${CM_EXPLORER:-<not set>}"
echo "  JSON RPC Relay Version  : ${CM_RELAY:-<not set>}"
echo "  Block Node Version      : ${CM_BLOCKNODE:-<not set>}"
echo ""

# ── Step 2: Run solo one-shot show deployment ────────────────────────────────
echo "--- solo one-shot show deployment output ---"
SHOW_ARGS=()
if [[ -n "${DEPLOYMENT}" ]]; then
  SHOW_ARGS+=(--deployment "${DEPLOYMENT}")
fi

SHOW_OUTPUT=$(npm run --silent solo-test -- one-shot show deployment "${SHOW_ARGS[@]}" 2>&1) || true
echo "${SHOW_OUTPUT}"
echo ""

# ── Step 3: Extract versions from CLI output ─────────────────────────────────
cli_version() {
  local label="$1"
  echo "${SHOW_OUTPUT}" | grep "${label}" | sed 's/.*: //' | tr -d '\r\033[0m\033[1m'
}

CLI_CHART=$(cli_version "Solo Chart Version")
CLI_CONSENSUS=$(cli_version "Consensus Node Version")
CLI_MIRROR=$(cli_version "Mirror Node Version")
CLI_EXPLORER=$(cli_version "Explorer Version")
CLI_RELAY=$(cli_version "JSON RPC Relay Version")
CLI_BLOCKNODE=$(cli_version "Block Node Version")

# ── Step 4: Compare ──────────────────────────────────────────────────────────
echo "--- Version comparison (ConfigMap vs CLI) ---"
PASS=true
compare() {
  local label="$1" cm="$2" cli="$3"
  # Normalize: strip leading v for comparison
  local cm_norm="${cm#v}" cli_norm="${cli#v}"
  if [[ "${cm_norm}" == "${cli_norm}" ]]; then
    echo "  ✓ ${label}: ${cm} (matches)"
  else
    echo "  ✗ ${label}: ConfigMap=${cm:-<empty>}  CLI=${cli:-<empty>}  MISMATCH"
    PASS=false
  fi
}

compare "Solo Chart Version    " "${CM_CHART}"     "${CLI_CHART}"
compare "Consensus Node Version" "${CM_CONSENSUS}" "${CLI_CONSENSUS}"
compare "Mirror Node Version   " "${CM_MIRROR}"    "${CLI_MIRROR}"
compare "Explorer Version      " "${CM_EXPLORER}"  "${CLI_EXPLORER}"
compare "JSON RPC Relay Version" "${CM_RELAY}"     "${CLI_RELAY}"
compare "Block Node Version    " "${CM_BLOCKNODE}" "${CLI_BLOCKNODE}"

echo ""
if ${PASS}; then
  echo "✅  All versions match between ConfigMap and 'show deployment'."
  exit 0
else
  echo "❌  Version mismatch detected. Check the output above for details."
  exit 1
fi
