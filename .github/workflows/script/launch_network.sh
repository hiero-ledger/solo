#!/bin/bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/helper.sh"

collect_failure_diagnostics() {
  local rc="${1}"

  echo "::group::Failure diagnostics"
  echo "launch_network.sh failed with exit code ${rc}"

  if command -v npm &> /dev/null; then
    echo "Collecting Solo deployment diagnostics for ${SOLO_DEPLOYMENT}..."
    npm run solo -- deployment diagnostics all --deployment "${SOLO_DEPLOYMENT}" -q --dev || true
    echo "Solo diagnostics collection finished. Check ~/.solo/logs for downloaded artifacts."
  else
    echo "npm is not available; skipping Solo diagnostics collection"
  fi

  echo "::endgroup::"
}

on_exit() {
  local rc=$?

  if [[ -n "${RENDERED_KIND_CLUSTER_CONFIG_FILE:-}" && -f "${RENDERED_KIND_CLUSTER_CONFIG_FILE}" ]]; then
    rm -f "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
  fi

  if [[ ${rc} -ne 0 ]]; then
    echo "Test failed, current port forward process: "
    ps -ef | grep port-forward
    collect_failure_diagnostics "${rc}"
  fi

  exit "${rc}"
}

trap on_exit EXIT

# Function to save current service ClusterIPs
save_cluster_ips() {
  local namespace="${1}"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Saving current ClusterIPs..."
  NODE1_IP=$(kubectl get svc -n "${namespace}" network-node1-svc -o jsonpath='{.spec.clusterIP}')
  NODE2_IP=$(kubectl get svc -n "${namespace}" network-node2-svc -o jsonpath='{.spec.clusterIP}')
  echo "  node1: ${NODE1_IP}"
  echo "  node2: ${NODE2_IP}"
}

# Function to restore service ClusterIPs using saved values
restore_cluster_ips() {
  local namespace="${1}"
  local saved_node1_ip="${2}"
  local saved_node2_ip="${3}"

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking if ClusterIPs changed..."
  local current_node1_ip=$(kubectl get svc -n "${namespace}" network-node1-svc -o jsonpath='{.spec.clusterIP}')
  local current_node2_ip=$(kubectl get svc -n "${namespace}" network-node2-svc -o jsonpath='{.spec.clusterIP}')

  if [[ "${saved_node1_ip}" != "${current_node1_ip}" ]] || [[ "${saved_node2_ip}" != "${current_node2_ip}" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ClusterIPs changed! Restoring old IPs..."
    echo "  node1: ${current_node1_ip} -> ${saved_node1_ip}"
    echo "  node2: ${current_node2_ip} -> ${saved_node2_ip}"

    # Save service definitions before deletion
    kubectl get svc -n "${namespace}" network-node1-svc -o yaml > /tmp/node1-svc-original.yaml
    kubectl get svc -n "${namespace}" network-node2-svc -o yaml > /tmp/node2-svc-original.yaml

    # Modify YAML to use preserved ClusterIPs and remove immutable/server-managed fields
    yq eval ".spec.clusterIP = \"${saved_node1_ip}\" | .spec.clusterIPs[0] = \"${saved_node1_ip}\" | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.managedFields, .status)" \
      /tmp/node1-svc-original.yaml > /tmp/node1-svc-patched.yaml

    yq eval ".spec.clusterIP = \"${saved_node2_ip}\" | .spec.clusterIPs[0] = \"${saved_node2_ip}\" | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.managedFields, .status)" \
      /tmp/node2-svc-original.yaml > /tmp/node2-svc-patched.yaml

    # Delete services and recreate with preserved IPs
    kubectl delete svc -n "${namespace}" network-node1-svc network-node2-svc
    kubectl apply -f /tmp/node1-svc-patched.yaml
    kubectl apply -f /tmp/node2-svc-patched.yaml

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Verified restored IPs:"
    kubectl get svc -n "${namespace}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ClusterIPs unchanged, no restoration needed"
  fi
}

# Function to display service IPs
show_service_ips() {
  local namespace="${1}"
  local label="${2}"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs ${label}:"
  kubectl get svc -n "${namespace}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp
}

# Function to reset the mirror importer hash chain in postgres so the importer skips
# hash chain verification for the first post-upgrade record file.
#
# Background: After a network freeze + CN restart, the consensus nodes run empty gossip
# rounds (no transactions, no record files) but the running hash still advances internally.
# The mirror importer has no record files for this period, so its last-known hash diverges
# from CN's baseline when nodes restart -> "Running hash mismatch".
#
# Fix: Set the last record_file.hash to the SHA-384 empty hash (96 zeros). The importer
# calls isHashEmpty(expectedPrevHash) and when true it skips chain verification, allowing
# the first post-restart file to be accepted. Subsequent files chain normally.
reset_importer_hash_chain_for_upgrade() {
  local namespace="${1}"

  echo ""
  echo "[IMPORTER_RESET] Resetting mirror importer hash chain for upgrade boundary..."

  # Find the postgres pod via label
  local postgresPod
  postgresPod=$(kubectl get pod -n "${namespace}" -l 'app.kubernetes.io/name=postgres' \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

  if [[ -z "${postgresPod}" ]]; then
    echo "[IMPORTER_RESET] Could not find postgres pod (label: app.kubernetes.io/name=postgres), skipping"
    return 0
  fi

  echo "[IMPORTER_RESET] Found postgres pod: ${postgresPod}"

  # Get the postgres superuser password from the Kubernetes secret
  local pgPassword
  pgPassword=$(kubectl get secret -n "${namespace}" solo-shared-resources-passwords \
    -o jsonpath='{.data.password}' 2>/dev/null | base64 -d || echo "")

  if [[ -z "${pgPassword}" ]]; then
    echo "[IMPORTER_RESET] Could not get postgres password from secret solo-shared-resources-passwords, skipping"
    return 0
  fi

  # Show current state for diagnostics
  local currentHash
  currentHash=$(kubectl exec -n "${namespace}" "${postgresPod}" -c postgresql -- \
    sh -c "PGPASSWORD='${pgPassword}' psql -U postgres -d mirror_node -t -A -c \
      \"SELECT hash FROM record_file ORDER BY consensus_end DESC LIMIT 1;\"" \
    2>/dev/null || echo "query_failed")
  echo "[IMPORTER_RESET] Current last record_file hash: ${currentHash:-none}"

  # Set the last record_file.hash to empty string so the importer treats it as "no previous hash available"
  # and skips hash chain verification for the first post-restart record file.
  # This handles the CN/MN running-hash desynchronization that occurs after a freeze+restart cycle:
  # the CN's internal running hash advances during freeze while the MN importer is paused,
  # causing the first post-restart record file's previousHash to not match the MN's last stored hash.
  # Setting hash='' causes Downloader.verifyHashChain() to call SHA_384.isHashEmpty("")=true
  # and log "Previous hash not available", skipping validation for just that one boundary file.
  local sqlResult
  sqlResult=$(kubectl exec -n "${namespace}" "${postgresPod}" -c postgresql -- \
    sh -c "PGPASSWORD='${pgPassword}' psql -U postgres -d mirror_node -t -A -c \
      \"UPDATE record_file SET hash = '' \
        WHERE consensus_end = (SELECT MAX(consensus_end) FROM record_file);\"" \
    2>&1 || echo "SQL_FAILED")

  if [[ "${sqlResult}" == *"SQL_FAILED"* ]] || echo "${sqlResult}" | grep -qi "error"; then
    echo "[IMPORTER_RESET] WARNING: Hash chain reset SQL failed: ${sqlResult}"
    echo "[IMPORTER_RESET] Mirror importer may still experience hash chain mismatch after upgrade"
  else
    echo "[IMPORTER_RESET] Hash chain reset completed (${sqlResult} row updated)"
    echo "[IMPORTER_RESET] Importer will skip hash chain verification for the first post-restart record file"
  fi
  echo ""
}

fromSoloVersion="${1}"
toConsensusNodeVersion="${2}"
if [[ -z "${fromSoloVersion}" ]]; then
  echo "Usage: $0 <fromSoloVersion> [toConsensusNodeVersion]"
  exit 1
fi

# check if yq is installed
if ! command -v yq &> /dev/null
then
    echo "yq could not be found, please install it first"
    exit 1
fi

echo "::group::Prerequisites"
npm install -g @hashgraph/solo@"${fromSoloVersion}" --force
solo --version

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=one-shot
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=one-shot
export MIRROR_NODE_VERSION_PRIOR_TO_UPGRADE=v0.152.0
export SOLO_LOG_LEVEL=debug
export PREV_BLOCK_VERSION=v0.28.0
export PREV_EXPLORER_VERSION=25.0.0
export PREV_RELAY_VERSION=0.76.0

KIND_CLUSTER_CONFIG_FILE="${KIND_CLUSTER_CONFIG_FILE:-.github/workflows/script/kind-config.yaml}"
KIND_CONFIG_RENDERER=".github/workflows/script/render_kind_config.sh"
RENDERED_KIND_CLUSTER_CONFIG_FILE=""

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
if [[ -f "${KIND_CLUSTER_CONFIG_FILE}" ]]; then
  if [[ -x "${KIND_CONFIG_RENDERER}" && -n "${KIND_DOCKER_REGISTRY_MIRRORS:-}" ]]; then
    RENDERED_KIND_CLUSTER_CONFIG_FILE="$(mktemp -t kind-config-XXXX.yaml)"
    "${KIND_CONFIG_RENDERER}" "${KIND_CLUSTER_CONFIG_FILE}" "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
    echo "Using rendered kind config file: ${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
    kind create cluster -n "${SOLO_CLUSTER_NAME}" --config "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
    rm -f "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
  else
    echo "Using kind config file: ${KIND_CLUSTER_CONFIG_FILE}"
    kind create cluster -n "${SOLO_CLUSTER_NAME}" --config "${KIND_CLUSTER_CONFIG_FILE}"
  fi
else
  echo "kind config file not found: ${KIND_CLUSTER_CONFIG_FILE}; creating cluster without custom registry mirror config."
  kind create cluster -n "${SOLO_CLUSTER_NAME}"
fi

rm -rf ~/.solo/*
echo "::endgroup::"

echo "::group::Launch solo using released Solo version ${fromSoloVersion}"

if [[ -z "${toConsensusNodeVersion}" ]]; then
  export TO_CONSENSUS_NODE_VERSION=$(extract_version TEST_UPGRADE_TO_VERSION version-test.ts)
  if [[ -z "${TO_CONSENSUS_NODE_VERSION}" ]]; then
    echo "TO_CONSENSUS_NODE_VERSION is empty, please check version-test.ts for TEST_UPGRADE_TO_VERSION"
    exit 1
  fi
else
  export TO_CONSENSUS_NODE_VERSION="${toConsensusNodeVersion}"
fi

export FROM_CONSENSUS_NODE_VERSION=$(extract_version TEST_UPGRADE_FROM_VERSION version-test.ts)
if [[ -z "${FROM_CONSENSUS_NODE_VERSION}" ]]; then
  echo "FROM_CONSENSUS_NODE_VERSION is empty, please check version-test.ts for TEST_UPGRADE_FROM_VERSION"
  exit 1
fi

echo "Consensus Node Version (from): ${FROM_CONSENSUS_NODE_VERSION}"
echo "Consensus Node Version (to): ${TO_CONSENSUS_NODE_VERSION}"

# export ONE_SHOT_WITH_BLOCK_NODE=true
solo one-shot falcon deploy --num-consensus-nodes 2

echo "::endgroup::"


echo "::group::Upgrade Solo"
# need to add ingress controller helm repo
echo "Upgrading with workspace Solo CLI"

npm run solo -- init --dev
# freeze network instead of using "node stop" to make sure the network is stopped elegantly
# need to use old solo to freeze the network since new solo freeze may not be compatible with old consensus node
# s6 container
solo -- consensus network freeze --deployment "${SOLO_DEPLOYMENT}" --dev

# using new solo to redeploy solo deployment chart to new version
show_service_ips "${SOLO_NAMESPACE}" "BEFORE network deploy"
save_cluster_ips "${SOLO_NAMESPACE}"

npm run solo -- consensus network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev

show_service_ips "${SOLO_NAMESPACE}" "AFTER network deploy"
restore_cluster_ips "${SOLO_NAMESPACE}" "${NODE1_IP}" "${NODE2_IP}"

npm run solo -- consensus node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev

show_service_ips "${SOLO_NAMESPACE}" "AFTER node setup"

# force mirror component restarts to pick up secret/config changes due to solo chart upgrade.
# deployment naming varies by chart version (e.g. mirror-* vs mirror-1-*), so discover dynamically.
mirrorComponentDeployments=$(kubectl get deployment -n solo-e2e -o name | grep -E '^deployment.apps/mirror(-[0-9]+)?-(importer|rest|restjava|web3|grpc|pinger|postgres-pgpool)$' || true)
if [[ -z "${mirrorComponentDeployments}" ]]; then
  echo "No mirror component deployments found to restart in namespace solo-e2e"
else
  while IFS= read -r deploymentName; do
    [[ -z "${deploymentName}" ]] && continue
    kubectl rollout restart "${deploymentName}" -n solo-e2e
  done <<< "${mirrorComponentDeployments}"
fi


# restart consensus nodes nodes after mirror nodes are restarted to avoid mirror nodes missing any stream files during restart
echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs BEFORE node start:"
kubectl get svc -n "${SOLO_NAMESPACE}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp
result=0
npm run solo -- consensus node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev || result=$?

echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs AFTER node start:"
kubectl get svc -n "${SOLO_NAMESPACE}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp


# npm run solo -- relay node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev

# # force restart relay pod to pick up changes of configMap
# kubectl rollout restart deployment/relay-1 -n solo-e2e
# kubectl rollout restart deployment/relay-1-ws -n solo-e2e

# Reset importer hash chain before upgrade so the first post-restart record file is accepted.
# The CN restart leaves a gap of empty gossip rounds (no record files) that advance the
# running hash internally. Clearing the last record_file.hash to empty string causes
# the importer to skip hash chain verification for the first post-restart file.
# reset_importer_hash_chain_for_upgrade "${SOLO_NAMESPACE}"

# redeploy mirror node to upgrade to a newer version
npm run solo -- mirror node upgrade --deployment "${SOLO_DEPLOYMENT}" --enable-ingress --pinger -q --dev
# npm run solo -- explorer node upgrade --deployment "${SOLO_DEPLOYMENT}" --mirrorNamespace ${SOLO_NAMESPACE} -q --dev

npm run solo -- deployment refresh port-forwards --deployment "${SOLO_DEPLOYMENT}"
# Test transaction can still be sent and processed
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
echo "::endgroup::"

echo "::group::Upgrade Consensus Node"
echo "Upgrade to Consensus Node Version: ${TO_CONSENSUS_NODE_VERSION}"
npm run solo -- consensus network upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --upgrade-version "${TO_CONSENSUS_NODE_VERSION}" -q --dev
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100 --dev

# block node v0.28.0+ requires consensus node v0.71.x+, so upgrade block node after CN upgrade
# npm run solo -- block node upgrade --deployment "${SOLO_DEPLOYMENT}"

# Restart relay deployment to reset the Hedera SDK's node health state.
# After the CN upgrade, the CN pods restart and the relay SDK marks all nodes as unhealthy
# with exponential backoff. Without a relay restart, the SDK may stay in a long backoff
# (several minutes) even after the CN pods become ACTIVE, causing eth_sendRawTransaction
# to fail with "All nodes are unhealthy". Restarting the relay gives the SDK a fresh start.
echo "Restarting relay deployment to reset SDK node health state after CN upgrade..."
kubectl rollout restart deployment/relay-1 deployment/relay-1-ws -n "${SOLO_NAMESPACE}" 2>/dev/null || true
kubectl rollout status deployment/relay-1 -n "${SOLO_NAMESPACE}" --timeout=3m --context kind-solo-e2e


echo "::endgroup::"

echo "::group::Final Verification"

npm run solo -- deployment refresh port-forwards --deployment "${SOLO_DEPLOYMENT}"

SKIP_IMPORTER_CHECK=true
.github/workflows/script/solo_smoke_test.sh "${SKIP_IMPORTER_CHECK}"
echo "::endgroup::"

echo "::group::Cleanup"
# uninstall components using current Solo version
npm run solo -- explorer node destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
npm run solo -- relay node destroy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --dev
npm run solo -- mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
npm run solo -- consensus node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --dev
npm run solo -- consensus network destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
echo "::endgroup::"
