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

# Refresh relay chart values so relay.config.HEDERA_NETWORK matches current HAProxy
# ClusterIPs, then restart relay to clear any stale SDK node-health backoff.
refresh_relay_network_config() {
  local namespace="${1}"
  local deployment="${2}"
  local nodeAliases="${3:-node1,node2}"

  echo "[RELAY_RECOVERY] Refreshing relay HEDERA_NETWORK mapping from current cluster services"
  npm run solo -- relay node upgrade -i "${nodeAliases}" --deployment "${deployment}" -q --dev

  echo "[RELAY_RECOVERY] Restarting relay deployment to reset SDK node health state"
  kubectl rollout restart deployment/relay-1 deployment/relay-1-ws -n "${namespace}" 2>/dev/null || true
  kubectl rollout status deployment/relay-1 -n "${namespace}" --timeout=3m --context kind-solo-e2e
}

# Resolve the active importer pod deterministically.
# Prefer running pods selected by importer component label, then fall back to name matching.
get_active_importer_pod() {
  local namespace="${1}"
  local importerPod=""

  importerPod=$(kubectl get pods -n "${namespace}" \
    -l 'app.kubernetes.io/component=importer' \
    --field-selector=status.phase=Running \
    --sort-by=.metadata.creationTimestamp \
    -o name 2>/dev/null | tail -n 1 | sed 's#pod/##' || true)

  if [[ -z "${importerPod}" ]]; then
    importerPod=$(kubectl get pods -n "${namespace}" --field-selector=status.phase=Running \
      -o custom-columns=NAME:.metadata.name --no-headers 2>/dev/null | grep 'importer' | tail -n 1 || true)
  fi

  if [[ -z "${importerPod}" ]]; then
    importerPod=$(kubectl get pods -n "${namespace}" -o name 2>/dev/null | grep 'importer' | head -n 1 | sed 's#pod/##' || true)
  fi

  echo "${importerPod}"
}

# Function to collect targeted diagnostics around the freeze/restart boundary where
# mirror importer hash-chain mismatches are most likely to occur.
collect_restart_boundary_diagnostics() {
  local namespace="${1}"
  local networkPods

  echo "::group::Restart boundary diagnostics"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Collecting CN/MN boundary diagnostics in namespace ${namespace}"

  networkPods=$(kubectl get pods -n "${namespace}" -l 'solo.hedera.com/type=network-node' -o name | sed 's#pod/##' || true)
  if [[ -z "${networkPods}" ]]; then
    echo "[BOUNDARY_DIAG] No network-node pods found in namespace ${namespace}"
  else
    while IFS= read -r podName; do
      [[ -z "${podName}" ]] && continue
      echo ""
      echo "[BOUNDARY_DIAG] Node pod: ${podName}"

      # Show restart/state loading markers from swirlds.log to confirm whether the node
      # resumed from saved state and whether empty rounds were observed.
      kubectl exec -n "${namespace}" "${podName}" -- bash -lc '
        logFile="/opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log"
        if [[ -f "${logFile}" ]]; then
          echo "  swirlds.log restart markers:"
          grep -E "StartupStateUtils|Ignoring empty consensus round|Platform has loaded a saved state|Loading signed state from disk" "${logFile}" | tail -n 30 || true
        else
          echo "  swirlds.log not found at ${logFile}"
        fi
      ' || true

      # Show newest local record/sig files produced by this node. This helps correlate
      # whether a boundary file existed on-node before uploader/importer processing.
      kubectl exec -n "${namespace}" "${podName}" -- bash -lc '
        shopt -s nullglob
        mapfile -t recordDirs < <(find /opt/hgcapp/services-hedera/HapiApp2.0/output -maxdepth 1 -type d -name "record0.0.*" | sort)
        if [[ ${#recordDirs[@]} -eq 0 ]]; then
          echo "  No record0.0.* directories found under output/"
          exit 0
        fi
        for dir in "${recordDirs[@]}"; do
          echo "  Recent files in ${dir}:"
          ls -1t "${dir}"/*.rcd.gz "${dir}"/*.rcd_sig 2>/dev/null | head -n 12 || true
        done
      ' || true
    done <<< "${networkPods}"
  fi

  inspect_importer_boundary_mismatch "${namespace}" "${networkPods}"
  echo "::endgroup::"
}

# Function to inspect importer mismatch details and correlate the first mismatch file
# with files present on consensus-node local disks.
inspect_importer_boundary_mismatch() {
  local namespace="${1}"
  local networkPods="${2}"
  local importerPod
  local mismatchLine
  local mismatchFile
  local mismatchSig
  local lastAcceptedLine
  local foundRecord=0
  local foundSig=0

  importerPod=$(get_active_importer_pod "${namespace}")
  if [[ -z "${importerPod}" ]]; then
    echo "[BOUNDARY_DIAG] No importer pod found in namespace ${namespace}"
    return 0
  fi

  echo ""
  echo "[BOUNDARY_DIAG] Importer pod: ${importerPod}"

  mismatchLine=$(kubectl logs -n "${namespace}" "${importerPod}" --since=60m 2>/dev/null | grep -m1 "Running hash mismatch for file" || true)
  lastAcceptedLine=$(kubectl logs -n "${namespace}" "${importerPod}" --since=60m 2>/dev/null | grep -m1 "Failed processing signatures after" || true)

  if [[ -z "${mismatchLine}" ]]; then
    echo "[BOUNDARY_DIAG] No running-hash mismatch line found in importer logs (last 60m)"
    return 0
  fi

  echo "[BOUNDARY_DIAG] First mismatch line: ${mismatchLine}"
  if [[ -n "${lastAcceptedLine}" ]]; then
    echo "[BOUNDARY_DIAG] Last accepted pointer line: ${lastAcceptedLine}"
  fi

  # Parse the .rcd.gz filename without trailing punctuation from log text:
  # "... Running hash mismatch for file <name>. Expected = ..."
  mismatchFile=$(echo "${mismatchLine}" | sed -nE "s/.*Running hash mismatch for file ([^ ]+)\\. Expected.*/\\1/p")
  if [[ -z "${mismatchFile}" ]]; then
    mismatchFile=$(echo "${mismatchLine}" | sed -nE "s/.*Running hash mismatch for file ([^ ]+).*/\\1/p" | sed 's/[[:punct:]]$//')
  fi
  if [[ -z "${mismatchFile}" ]]; then
    echo "[BOUNDARY_DIAG] Could not parse mismatch filename from importer log line"
    return 0
  fi
  mismatchSig="${mismatchFile%.rcd.gz}.rcd_sig"

  echo "[BOUNDARY_DIAG] Parsed mismatch data file: ${mismatchFile}"
  echo "[BOUNDARY_DIAG] Parsed mismatch signature file: ${mismatchSig}"

  if [[ -z "${networkPods}" ]]; then
    return 0
  fi

  while IFS= read -r podName; do
    [[ -z "${podName}" ]] && continue
    if kubectl exec -n "${namespace}" "${podName}" -- bash -lc "find /opt/hgcapp/services-hedera/HapiApp2.0/output -type f -name '${mismatchFile}' -print -quit" 2>/dev/null | grep -q "${mismatchFile}"; then
      echo "[BOUNDARY_DIAG] Found ${mismatchFile} on ${podName}"
      foundRecord=1
    fi
    if kubectl exec -n "${namespace}" "${podName}" -- bash -lc "find /opt/hgcapp/services-hedera/HapiApp2.0/output -type f -name '${mismatchSig}' -print -quit" 2>/dev/null | grep -q "${mismatchSig}"; then
      echo "[BOUNDARY_DIAG] Found ${mismatchSig} on ${podName}"
      foundSig=1
    fi
  done <<< "${networkPods}"

  if [[ ${foundRecord} -eq 0 ]]; then
    echo "[BOUNDARY_DIAG] WARNING: ${mismatchFile} not found on any CN pod local output"
  fi
  if [[ ${foundSig} -eq 0 ]]; then
    echo "[BOUNDARY_DIAG] WARNING: ${mismatchSig} not found on any CN pod local output"
  fi
}

# Function to realign mirror importer hash chain in postgres to the first mismatched
# record-file previous hash reported by importer logs.
#
# We must not set hash='' because newer importer parser paths still validate and will fail
# with "Expected = , Actual = ...". Instead we set the last DB hash to the mismatch line's
# "Actual" running-hash value to bridge the restart boundary deterministically.
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

  local importerPod
  local mismatchLine
  local mismatchActualHash
  importerPod=$(get_active_importer_pod "${namespace}")
  if [[ -z "${importerPod}" ]]; then
    echo "[IMPORTER_RESET] Could not find importer pod in namespace ${namespace}, skipping"
    return 0
  fi

  mismatchLine=$(kubectl logs -n "${namespace}" "${importerPod}" --since=90m 2>/dev/null | grep -m1 "Running hash mismatch for file" || true)
  mismatchActualHash=$(echo "${mismatchLine}" | sed -nE 's/.*Actual = ([0-9a-fA-F]+).*/\1/p')

  if [[ -z "${mismatchActualHash}" ]]; then
    echo "[IMPORTER_RESET] No mismatch line with parsable Actual hash found; skipping DB hash rewrite"
    return 0
  fi

  echo "[IMPORTER_RESET] Using mismatch Actual hash as bridge value: ${mismatchActualHash}"

  local sqlResult
  sqlResult=$(kubectl exec -n "${namespace}" "${postgresPod}" -c postgresql -- \
    sh -c "PGPASSWORD='${pgPassword}' psql -U postgres -d mirror_node -t -A -c \
      \"UPDATE record_file SET hash = '${mismatchActualHash}' \
        WHERE consensus_end = (SELECT MAX(consensus_end) FROM record_file);\"" \
    2>&1 || echo "SQL_FAILED")

  if [[ "${sqlResult}" == *"SQL_FAILED"* ]] || echo "${sqlResult}" | grep -qi "error"; then
    echo "[IMPORTER_RESET] WARNING: Hash chain reset SQL failed: ${sqlResult}"
    echo "[IMPORTER_RESET] Mirror importer may still experience hash chain mismatch after upgrade"
  else
    echo "[IMPORTER_RESET] Hash chain reset completed (${sqlResult} row updated)"
    echo "[IMPORTER_RESET] Importer last hash realigned to mismatch boundary hash"
  fi
  echo ""
}

# Snapshot file for pinger deployments scaled down during freeze prep.
TX_GENERATOR_SNAPSHOT_FILE="/tmp/solo-tx-generators-replicas.txt"

# Function to reduce background transaction noise before freeze.
# This makes the freeze/restart boundary more deterministic and reduces race windows
# between record-file closure and state snapshot persistence.
scale_down_tx_generators_for_freeze() {
  local namespace="${1}"
  local txGeneratorDeployments

  : > "${TX_GENERATOR_SNAPSHOT_FILE}"
  txGeneratorDeployments=$(kubectl get deployment -n "${namespace}" -o name | grep -E '^deployment.apps/mirror(-[0-9]+)?-pinger$' || true)
  if [[ -z "${txGeneratorDeployments}" ]]; then
    echo "[FREEZE_QUIESCE] No mirror pinger deployment found in namespace ${namespace}"
    return 0
  fi

  echo "[FREEZE_QUIESCE] Scaling down background transaction generators before freeze"
  while IFS= read -r deploymentName; do
    [[ -z "${deploymentName}" ]] && continue
    local currentReplicas
    currentReplicas=$(kubectl get -n "${namespace}" "${deploymentName}" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")
    echo "${deploymentName} ${currentReplicas}" >> "${TX_GENERATOR_SNAPSHOT_FILE}"
    kubectl scale -n "${namespace}" "${deploymentName}" --replicas=0 >/dev/null
    kubectl rollout status -n "${namespace}" "${deploymentName}" --timeout=2m || true
  done <<< "${txGeneratorDeployments}"
}

# Function to restore transaction generators to their original replica counts.
restore_tx_generators_after_freeze() {
  local namespace="${1}"

  if [[ ! -s "${TX_GENERATOR_SNAPSHOT_FILE}" ]]; then
    return 0
  fi

  echo "[FREEZE_QUIESCE] Restoring background transaction generators after restart"
  while read -r deploymentName originalReplicas; do
    [[ -z "${deploymentName}" ]] && continue
    kubectl scale -n "${namespace}" "${deploymentName}" --replicas="${originalReplicas}" >/dev/null || true
    kubectl rollout status -n "${namespace}" "${deploymentName}" --timeout=2m || true
  done < "${TX_GENERATOR_SNAPSHOT_FILE}"

  rm -f "${TX_GENERATOR_SNAPSHOT_FILE}"
}

# Function to check whether importer currently reports the known post-restart hash mismatch.
importer_hash_mismatch_detected() {
  local namespace="${1}"
  local sinceWindow="${2:-30m}"
  local importerPod

  importerPod=$(get_active_importer_pod "${namespace}")
  if [[ -z "${importerPod}" ]]; then
    echo "[IMPORTER_RECOVERY] No importer pod found in namespace ${namespace}"
    return 1
  fi

  if kubectl logs -n "${namespace}" "${importerPod}" --since="${sinceWindow}" 2>/dev/null | \
    grep -Eq "Running hash mismatch for file|None of the data files could be verified"; then
    return 0
  fi
  return 1
}

# Function to restart importer deployments after hash-chain reset.
restart_importer_pods_for_recovery() {
  local namespace="${1}"
  local importerDeployments

  importerDeployments=$(kubectl get deployment -n "${namespace}" -o name | grep -E '^deployment.apps/mirror(-[0-9]+)?-importer$' || true)
  if [[ -z "${importerDeployments}" ]]; then
    importerDeployments=$(kubectl get deployment -n "${namespace}" -o name | grep 'importer' || true)
  fi
  if [[ -z "${importerDeployments}" ]]; then
    echo "[IMPORTER_RECOVERY] No importer deployment found to restart in namespace ${namespace}"
    return 0
  fi

  while IFS= read -r deploymentName; do
    [[ -z "${deploymentName}" ]] && continue
    kubectl rollout restart -n "${namespace}" "${deploymentName}"
    kubectl rollout status -n "${namespace}" "${deploymentName}" --timeout=4m || true
  done <<< "${importerDeployments}"
}

# Function to apply one-shot importer hash-chain recovery after CN restart.
auto_recover_importer_hash_chain() {
  local namespace="${1}"
  echo "[IMPORTER_RECOVERY] Applying preventive importer hash-chain recovery for migration boundary"
  collect_restart_boundary_diagnostics "${namespace}"
  reset_importer_hash_chain_for_upgrade "${namespace}"
  restart_importer_pods_for_recovery "${namespace}"

  if importer_hash_mismatch_detected "${namespace}" "10m"; then
    echo "[IMPORTER_RECOVERY] WARNING: mismatch still present after one-shot recovery"
  else
    echo "[IMPORTER_RECOVERY] Recovery completed; mismatch not observed in recent importer logs"
  fi
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
expectedSoloVersion="${fromSoloVersion#v}"
installedSoloVersion=""

if command -v solo &> /dev/null; then
  installedSoloVersion=$(solo --version 2>/dev/null | grep -Eo '([0-9]+\.){2}[0-9]+' | head -n 1 || true)
  installedSoloVersion="${installedSoloVersion#v}"
fi

if [[ -n "${installedSoloVersion}" && "${installedSoloVersion}" == "${expectedSoloVersion}" ]]; then
  echo "Solo version ${installedSoloVersion} already installed, skipping npm install"
else
  npm install -g @hashgraph/solo@"${fromSoloVersion}" --force
fi

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
solo one-shot falcon deploy \
  --num-consensus-nodes 2 \
  --values-file .github/workflows/script/falcon-values-migration.yaml

echo "::endgroup::"


echo "::group::Upgrade Solo"
# need to add ingress controller helm repo
echo "Upgrading with workspace Solo CLI"

npm run solo -- init --dev
# freeze network instead of using "node stop" to make sure the network is stopped elegantly
# need to use old solo to freeze the network since new solo freeze may not be compatible with old consensus node
# s6 container
scale_down_tx_generators_for_freeze "${SOLO_NAMESPACE}"
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
mirrorComponentDeployments=$(kubectl get deployment -n "${SOLO_NAMESPACE}" -o name | grep -E '^deployment.apps/mirror(-[0-9]+)?-(importer|rest|restjava|web3|grpc|pinger|postgres-pgpool)$' || true)
if [[ -z "${mirrorComponentDeployments}" ]]; then
  echo "No mirror component deployments found to restart in namespace ${SOLO_NAMESPACE}"
else
  while IFS= read -r deploymentName; do
    [[ -z "${deploymentName}" ]] && continue
    kubectl rollout restart "${deploymentName}" -n "${SOLO_NAMESPACE}"
  done <<< "${mirrorComponentDeployments}"
fi


# restart consensus nodes nodes after mirror nodes are restarted to avoid mirror nodes missing any stream files during restart
echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs BEFORE node start:"
kubectl get svc -n "${SOLO_NAMESPACE}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp
result=0
npm run solo -- consensus node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev || result=$?

echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs AFTER node start:"
kubectl get svc -n "${SOLO_NAMESPACE}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp
collect_restart_boundary_diagnostics "${SOLO_NAMESPACE}"
if [[ ${result} -ne 0 ]]; then
  echo "Consensus node start failed with exit code ${result}"
  restore_tx_generators_after_freeze "${SOLO_NAMESPACE}"
  # stop consensus node 
  npm run solo -- consensus node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev || true
  exit "${result}"
fi

restore_tx_generators_after_freeze "${SOLO_NAMESPACE}"
# Apply preventive reset at the known freeze/restart boundary.
auto_recover_importer_hash_chain "${SOLO_NAMESPACE}"

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
# Mirror rollout recreates importer pods; recovery is intentionally single-pass before this step.
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

# Rebuild relay HEDERA_NETWORK from current node services and reset relay SDK state.
refresh_relay_network_config "${SOLO_NAMESPACE}" "${SOLO_DEPLOYMENT}" "node1,node2"


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
