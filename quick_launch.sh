#!/usr/bin/env bash
set -euo pipefail

# Reproducer for https://github.com/hiero-ledger/solo/issues/3664
# Usage:
#   ./quick_launch.sh              # expected to FAIL before fix (overlay not applied)
#   ./quick_launch.sh --enable-fix # expected to PASS with block-node TSS overlay override

ENABLE_FIX=false
if [[ "${1:-}" == "--enable-fix" ]]; then
  ENABLE_FIX=true
fi

export SOLO_CLUSTER_NAME=solo-3664
export SOLO_NAMESPACE=solo-3664
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-3664
export SOLO_LOG_LEVEL="${SOLO_LOG_LEVEL:-info}"

printf '\n=== [3664 repro] enable_fix=%s ===\n' "${ENABLE_FIX}"

kind delete cluster --name "${SOLO_CLUSTER_NAME}" >/dev/null 2>&1 || true
kind create cluster --name "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*
rm -rf test/data/tmp/*

npm run solo-test -- cluster-ref config connect \
  --cluster-ref "kind-${SOLO_CLUSTER_NAME}" \
  --context "kind-${SOLO_CLUSTER_NAME}"

npm run solo-test -- deployment config create \
  -n "${SOLO_NAMESPACE}" \
  --deployment "${SOLO_DEPLOYMENT}"

npm run solo-test -- deployment cluster attach \
  --deployment "${SOLO_DEPLOYMENT}" \
  --cluster-ref "kind-${SOLO_CLUSTER_NAME}" \
  --num-consensus-nodes 1

npm run solo-test -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

BLOCK_NODE_ARGS=(
  block
  node
  add
  --deployment "${SOLO_DEPLOYMENT}"
  --cluster-ref "kind-${SOLO_CLUSTER_NAME}"
)

if [[ "${ENABLE_FIX}" == "true" ]]; then
  BLOCK_NODE_ARGS+=(--block-node-tss-overlay)
fi

set +e
npm run solo-test -- "${BLOCK_NODE_ARGS[@]}"
BLOCK_NODE_ADD_EXIT_CODE=$?
set -e

if [[ ${BLOCK_NODE_ADD_EXIT_CODE} -ne 0 ]]; then
  echo "WARN: 'block node add' exited with code ${BLOCK_NODE_ADD_EXIT_CODE}; continuing for resource-profile assertion."
fi

BLOCK_NODE_STS="$(
  kubectl get sts -n "${SOLO_NAMESPACE}" -l block-node.hiero.com/type=block-node -o jsonpath='{.items[0].metadata.name}'
)"

if [[ -z "${BLOCK_NODE_STS}" ]]; then
  echo "FAIL: could not find block-node StatefulSet in namespace ${SOLO_NAMESPACE}" >&2
  exit 1
fi

REQ_MEMORY="$(kubectl get sts "${BLOCK_NODE_STS}" -n "${SOLO_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[0].resources.requests.memory}')"
LIM_MEMORY="$(kubectl get sts "${BLOCK_NODE_STS}" -n "${SOLO_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[0].resources.limits.memory}')"

echo "Observed block-node resources: requests.memory=${REQ_MEMORY}, limits.memory=${LIM_MEMORY}"

if [[ "${REQ_MEMORY}" == "1Gi" && "${LIM_MEMORY}" == "2Gi" ]]; then
  echo "PASS: TSS overlay resource profile is active."
  exit 0
fi

echo "FAIL: TSS overlay resource profile is NOT active (expected requests=1Gi limits=2Gi)." >&2
exit 1
