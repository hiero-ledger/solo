#!/bin/bash
# Reproduction script for hiero-ledger/solo#3923
# "Solo consensus network upgrade can fail copying --local-build-path"
#
# Reproduces the race condition where `consensus network upgrade --local-build-path`
# attempts kubectl cp into pods still in a Failed/Pending state after the freeze+restart
# cycle, causing: "cannot exec into a container in a completed pod; current phase is Failed"
#
# Usage: ./repro_3923.sh [/path/to/hiero-consensus-node/hedera-node/data]
# If no path is given, defaults to ../hiero-consensus-node/hedera-node/data
#
# Prerequisites:
#   - kind, kubectl, helm installed
#   - Local hiero-consensus-node build exists at CN_LOCAL_BUILD_PATH
#   - npm dependencies installed (npm install in solo repo root)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

wait_for_consensus_pods_ready() {
  local timeout_secs="${1:-600}"
  local nodes=()
  IFS=',' read -r -a nodes <<< "${NODE_ALIASES}"
  for node in "${nodes[@]}"; do
    echo "  Waiting for network-${node}-0 to be Ready..."
    kubectl -n "${SOLO_NAMESPACE}" wait --for=condition=ready "pod/network-${node}-0" --timeout="${timeout_secs}s"
  done
}

CN_LOCAL_BUILD_PATH="${1:-${SCRIPT_DIR}/../hiero-consensus-node/hedera-node/data}"

if [ ! -d "${CN_LOCAL_BUILD_PATH}" ]; then
  echo "ERROR: Local build path not found: ${CN_LOCAL_BUILD_PATH}"
  echo "Usage: $0 [/path/to/hiero-consensus-node/hedera-node/data]"
  exit 1
fi

export SOLO_CLUSTER_NAME=solo-repro-3923
export SOLO_NAMESPACE=solo-repro-3923
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster-3923
export SOLO_DEPLOYMENT=deployment-3923

# 3-node cluster mirrors the issue report
export NODE_ALIASES="node1,node2"
NUM_NODES=2

# Initial released version to deploy (matches issue report baseline)
INITIAL_RELEASE_TAG="v0.72.0-rc.2"

echo "============================================================"
echo "Reproduction script for hiero-ledger/solo#3923"
echo "  Cluster:          ${SOLO_CLUSTER_NAME}"
echo "  Namespace:        ${SOLO_NAMESPACE}"
echo "  Nodes:            ${NODE_ALIASES}"
echo "  Initial version:  ${INITIAL_RELEASE_TAG}"
echo "  Local build path: ${CN_LOCAL_BUILD_PATH}"
echo "============================================================"
echo ""

# ── Cleanup ──────────────────────────────────────────────────────────────────
echo ">>> [1/8] Cleaning up any previous state..."
kind delete cluster --name "${SOLO_CLUSTER_NAME}" >/dev/null 2>&1 || true
rm -f "${HOME}/.solo/local-config.yaml"
rm -rf "${HOME}/.solo/cache"/*

# ── Create cluster ────────────────────────────────────────────────────────────
echo ""
echo ">>> [2/8] Creating Kind cluster '${SOLO_CLUSTER_NAME}'..."
kind create cluster -n "${SOLO_CLUSTER_NAME}"

# ── Solo bootstrap ────────────────────────────────────────────────────────────
echo ""
echo ">>> [3/8] Bootstrapping Solo (init, cluster-ref, deployment, cluster-setup)..."

npm run solo-test -- init

npm run solo-test -- cluster-ref config connect \
  --cluster-ref "kind-${SOLO_CLUSTER_NAME}" \
  --context "kind-${SOLO_CLUSTER_NAME}"

npm run solo-test -- deployment config create \
  -n "${SOLO_NAMESPACE}" \
  --deployment "${SOLO_DEPLOYMENT}"

npm run solo-test -- deployment cluster attach \
  --deployment "${SOLO_DEPLOYMENT}" \
  --cluster-ref "kind-${SOLO_CLUSTER_NAME}" \
  --num-consensus-nodes "${NUM_NODES}"

npm run solo-test -- cluster-ref config setup \
  --cluster-ref "kind-${SOLO_CLUSTER_NAME}" \
  --cluster-setup-namespace "${SOLO_CLUSTER_SETUP_NAMESPACE}" \
  --minio true \
  --prometheus-stack false \
  --quiet-mode

# ── Key generation ────────────────────────────────────────────────────────────
echo ""
echo ">>> [4/8] Generating consensus keys..."
npm run solo-test -- keys consensus generate \
  --gossip-keys \
  --tls-keys \
  --deployment "${SOLO_DEPLOYMENT}" \
  -i "${NODE_ALIASES}"

# ── Deploy network at initial released version (no local build) ───────────────
echo ""
echo ">>> [5/8] Deploying consensus network at initial version ${INITIAL_RELEASE_TAG} (released)..."
npm run solo-test -- consensus network deploy \
  --deployment "${SOLO_DEPLOYMENT}" \
  -i "${NODE_ALIASES}" \
  --pvcs true \
  --application-properties application.properties \
  --release-tag "${INITIAL_RELEASE_TAG}"

# ── Node setup (released version, no local build) ─────────────────────────────
echo ""
echo ">>> [6/8] Running consensus node setup with released version (no --local-build-path)..."
npm run solo-test -- consensus node setup \
  --deployment "${SOLO_DEPLOYMENT}" \
  -i "${NODE_ALIASES}" \
  --release-tag "${INITIAL_RELEASE_TAG}"

# ── Start network ─────────────────────────────────────────────────────────────
echo ""
echo ">>> [7/8] Starting consensus nodes..."
npm run solo-test -- consensus node start \
  --deployment "${SOLO_DEPLOYMENT}" \
  -i "${NODE_ALIASES}" \
  --force-port-forward false

echo ""
echo ">>> Waiting for consensus pods to be Ready before upgrade..."
wait_for_consensus_pods_ready 600

# ── Upgrade with local build path (triggers race condition) ───────────────────
echo ""
echo ">>> [8/8] Running consensus network upgrade with --local-build-path..."
echo "         (This is where the race condition in #3923 should manifest)"
echo "         Watching for: 'cannot exec into a container in a completed pod'"
echo ""

npm run solo-test -- consensus network upgrade \
  --deployment "${SOLO_DEPLOYMENT}" \
  --upgrade-version v0.73.0-rc.1 \
  -i "${NODE_ALIASES}" \
  --local-build-path "${CN_LOCAL_BUILD_PATH}" \
  2>&1 | tee /tmp/repro_3923_upgrade.log

echo ""
echo "============================================================"
if grep -q "cannot exec into a container in a completed pod" /tmp/repro_3923_upgrade.log; then
  echo "REPRODUCED: Race condition error found in upgrade output."
  echo "See /tmp/repro_3923_upgrade.log for full details."
else
  echo "Issue NOT reproduced (or error message changed)."
  echo "Full upgrade log at /tmp/repro_3923_upgrade.log"
fi
echo "============================================================"
