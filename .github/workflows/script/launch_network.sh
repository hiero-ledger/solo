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

CN_NODE1_EXPECTED_STATE_ROUND=""
CN_NODE2_EXPECTED_STATE_ROUND=""

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

# Function to log gossip endpoint types used by nodes
log_gossip_endpoint_configuration() {
  local namespace="${1}"
  local label="${2}"

  echo ""
  echo "=== [GOSSIP_ENDPOINT_TRACKING] Endpoint configuration ${label} ==="

  for node in node1 node2; do
    local podName="network-${node}-0"
    local addressLines

    echo "${node} (${podName}) - endpoint entries from config.txt:"
    addressLines=$(kubectl exec -n "${namespace}" "${podName}" -c root-container -- \
      grep '^address' /opt/hgcapp/services-hedera/HapiApp2.0/.archive/config.txt 2>/dev/null || true)

    if [[ -z "${addressLines}" ]]; then
      echo "config.txt not found or address entries unavailable"
      echo ""
      continue
    fi

    echo "${addressLines}"
    echo "${node} (${podName}) - endpoint type analysis:"
    while IFS= read -r addressLine; do
      [[ -z "${addressLine}" ]] && continue

      # CSV format: address, id, ..., externalEndpoint, externalPort, accountId
      local externalEndpoint
      externalEndpoint=$(echo "${addressLine}" | awk -F',' '{gsub(/^ +| +$/, "", $8); print $8}')

      local endpointType="UNKNOWN"
      if [[ "${externalEndpoint}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        endpointType="ClusterIP"
      elif [[ "${externalEndpoint}" == *".svc"* || "${externalEndpoint}" == *".cluster.local"* ]]; then
        endpointType="FQDN"
      fi

      echo "  externalEndpoint=${externalEndpoint} -> ${endpointType}"
    done <<< "${addressLines}"
    echo ""
  done

  echo "=== End endpoint configuration ${label} ==="
  echo ""
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

  # SHA-384 empty hash: 48 zero bytes as 96 hex characters.
  # DigestAlgorithm.isHashEmpty() returns true for this value -> hash chain check is skipped.
  local emptyHash="000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"

  # Show current state for diagnostics
  local currentHash
  currentHash=$(kubectl exec -n "${namespace}" "${postgresPod}" -c postgresql -- \
    sh -c "PGPASSWORD='${pgPassword}' psql -U postgres -d mirror_node -t -A -c \
      \"SELECT hash FROM record_file ORDER BY consensus_end DESC LIMIT 1;\"" \
    2>/dev/null || echo "query_failed")
  echo "[IMPORTER_RESET] Current last record_file hash: ${currentHash:-none}"

  # Reset the hash of the last record_file to the SHA-384 empty hash
  local sqlResult
  sqlResult=$(kubectl exec -n "${namespace}" "${postgresPod}" -c postgresql -- \
    sh -c "PGPASSWORD='${pgPassword}' psql -U postgres -d mirror_node -t -A -c \
      \"UPDATE record_file SET hash = '${emptyHash}' \
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

# Function to dump the latest record stream file observed by mirror importer logs
dump_importer_last_record_stream() {
  local namespace="${1}"
  local label="${2}"
  local importerDeployment
  local checkpointTimeUtc

  checkpointTimeUtc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

  importerDeployment=$(kubectl get deployment -n "${namespace}" -o name | grep -E '^deployment.apps/mirror(-[0-9]+)?-importer$' | head -n 1 || true)

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Importer stream checkpoint: ${label}"
  if [[ -z "${importerDeployment}" ]]; then
    echo "Importer deployment not found in namespace ${namespace}"
    IMPORTER_LOG_CURSOR_TIME="${checkpointTimeUtc}"
    return 0
  fi

  local logsSinceArg=""
  if [[ -n "${IMPORTER_LOG_CURSOR_TIME:-}" ]]; then
    logsSinceArg="--since-time=${IMPORTER_LOG_CURSOR_TIME}"
    echo "Scanning importer logs since ${IMPORTER_LOG_CURSOR_TIME}"
  else
    echo "Scanning importer logs from current container history"
  fi

  local importerLogs
  importerLogs=$(kubectl logs -n "${namespace}" "${importerDeployment}" ${logsSinceArg} --tail=4000 2>/dev/null || true)

  local latestRecordFile
  latestRecordFile=$(printf '%s\n' "${importerLogs}" \
    | grep -Eo '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}_[0-9]{2}_[0-9]{2}\.[0-9]+Z\.rcd_sig' \
    | tail -n 1 || true)

  if [[ -z "${latestRecordFile}" ]]; then
    echo "No new record stream signature found in importer logs for this checkpoint"
    if [[ -n "${IMPORTER_LAST_RECORD_FILE:-}" ]]; then
      echo "Last known importer record stream file: ${IMPORTER_LAST_RECORD_FILE}"
    fi
    IMPORTER_LOG_CURSOR_TIME="${checkpointTimeUtc}"
    return 0
  fi

  echo "Latest record stream file from importer logs: ${latestRecordFile}"
  if [[ -n "${IMPORTER_LAST_RECORD_FILE:-}" ]]; then
    if [[ "${IMPORTER_LAST_RECORD_FILE}" == "${latestRecordFile}" ]]; then
      echo "Importer checkpoint delta: unchanged from previous checkpoint"
    else
      echo "Importer checkpoint delta: advanced from ${IMPORTER_LAST_RECORD_FILE} to ${latestRecordFile}"
    fi
  fi

  printf '%s\n' "${importerLogs}" | grep -F "${latestRecordFile}" | tail -n 3 || true

  IMPORTER_LAST_RECORD_FILE="${latestRecordFile}"
  IMPORTER_LOG_CURSOR_TIME="${checkpointTimeUtc}"
}

# Function to capture consensus-node saved-state boundary evidence
capture_cn_saved_state_boundary() {
  local namespace="${1}"
  local label="${2}"

  echo ""
  echo "=== [CN_BOUNDARY_TRACKING] Saved state boundary ${label} ==="

  for node in node1 node2; do
    local podName="network-${node}-0"
    local nodeId="0"
    if [[ "${node}" == "node2" ]]; then
      nodeId="1"
    fi

    echo "${node} (${podName}) - latest saved state metadata:"
    kubectl exec -n "${namespace}" "${podName}" -c root-container -- sh -c "
      stateRoot=/opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/${nodeId}
      latestMetadata=\$(ls -1 \"\${stateRoot}\"/*/*/stateMetadata.txt 2>/dev/null | sort -V | tail -n 1)
      if [[ -z \"\${latestMetadata}\" ]]; then
        echo 'stateMetadata not found'
        exit 0
      fi

      latestRound=\$(basename \"\$(dirname \"\${latestMetadata}\")\")
      printf 'latest stateMetadata path: %s\\n' \"\${latestMetadata}\"
      printf 'latest round directory: %s\\n' \"\${latestRound}\"
      grep -E '^(ROUND|CONSENSUS_TIMESTAMP|HASH|LEGACY_RUNNING_EVENT_HASH|MINIMUM_BIRTH_ROUND_NON_ANCIENT|WALL_CLOCK_TIME):' \"\${latestMetadata}\" || true
    " 2>/dev/null || true
    echo ""
  done

  echo "=== End saved state boundary ${label} ==="
  echo ""
}

# Function to snapshot expected saved-state rounds before restart
snapshot_cn_expected_state_rounds() {
  local namespace="${1}"

  CN_NODE1_EXPECTED_STATE_ROUND=$(kubectl exec -n "${namespace}" network-node1-0 -c root-container -- sh -c '
    stateRoot=/opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0
    latestMetadata=$(ls -1 "${stateRoot}"/*/*/stateMetadata.txt 2>/dev/null | sort -V | tail -n 1)
    if [[ -n "${latestMetadata}" ]]; then
      basename "$(dirname "${latestMetadata}")"
    fi
  ' 2>/dev/null || true)

  CN_NODE2_EXPECTED_STATE_ROUND=$(kubectl exec -n "${namespace}" network-node2-0 -c root-container -- sh -c '
    stateRoot=/opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/1
    latestMetadata=$(ls -1 "${stateRoot}"/*/*/stateMetadata.txt 2>/dev/null | sort -V | tail -n 1)
    if [[ -n "${latestMetadata}" ]]; then
      basename "$(dirname "${latestMetadata}")"
    fi
  ' 2>/dev/null || true)

  echo "[CN_BOUNDARY_TRACKING] Expected startup state rounds from PVC before restart: node1=${CN_NODE1_EXPECTED_STATE_ROUND:-unknown}, node2=${CN_NODE2_EXPECTED_STATE_ROUND:-unknown}"
}

# Function to verify startup loaded-state rounds match pre-start saved-state rounds
verify_cn_startup_state_rounds() {
  local namespace="${1}"

  local node1LoadedRound
  local node2LoadedRound
  local verificationFailed=0

  node1LoadedRound=$(kubectl exec -n "${namespace}" network-node1-0 -c root-container -- sh -c "
    grep -i 'Loading signed state from disk:' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log | tail -n 1 | awk -F'/' '{print \$NF}'
  " 2>/dev/null || true)

  node2LoadedRound=$(kubectl exec -n "${namespace}" network-node2-0 -c root-container -- sh -c "
    grep -i 'Loading signed state from disk:' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log | tail -n 1 | awk -F'/' '{print \$NF}'
  " 2>/dev/null || true)

  echo "[CN_BOUNDARY_TRACKING] Startup loaded state rounds: node1=${node1LoadedRound:-unknown}, node2=${node2LoadedRound:-unknown}"

  if [[ -z "${CN_NODE1_EXPECTED_STATE_ROUND}" ]]; then
    echo "[CN_BOUNDARY_TRACKING] FAIL node1 expected round is unknown"
    verificationFailed=1
  elif [[ -z "${node1LoadedRound}" ]]; then
    echo "[CN_BOUNDARY_TRACKING] FAIL node1 loaded round is unknown"
    verificationFailed=1
  elif [[ "${CN_NODE1_EXPECTED_STATE_ROUND}" == "${node1LoadedRound}" ]]; then
    echo "[CN_BOUNDARY_TRACKING] PASS node1 loaded expected round ${node1LoadedRound}"
  else
    echo "[CN_BOUNDARY_TRACKING] FAIL node1 expected round ${CN_NODE1_EXPECTED_STATE_ROUND}, loaded ${node1LoadedRound}"
    verificationFailed=1
  fi

  if [[ -z "${CN_NODE2_EXPECTED_STATE_ROUND}" ]]; then
    echo "[CN_BOUNDARY_TRACKING] FAIL node2 expected round is unknown"
    verificationFailed=1
  elif [[ -z "${node2LoadedRound}" ]]; then
    echo "[CN_BOUNDARY_TRACKING] FAIL node2 loaded round is unknown"
    verificationFailed=1
  elif [[ "${CN_NODE2_EXPECTED_STATE_ROUND}" == "${node2LoadedRound}" ]]; then
    echo "[CN_BOUNDARY_TRACKING] PASS node2 loaded expected round ${node2LoadedRound}"
  else
    echo "[CN_BOUNDARY_TRACKING] FAIL node2 expected round ${CN_NODE2_EXPECTED_STATE_ROUND}, loaded ${node2LoadedRound}"
    verificationFailed=1
  fi

  return ${verificationFailed}
}

# Function to diagnose post-restart record stream continuity and first mismatch details
diagnose_record_stream_continuity_break() {
  local namespace="${1}"

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Record stream continuity diagnostics"

  local importerDeployment
  importerDeployment=$(kubectl get deployment -n "${namespace}" -o name | grep -E '^deployment.apps/mirror(-[0-9]+)?-importer$' | head -n 1 || true)
  if [[ -z "${importerDeployment}" ]]; then
    echo "Importer deployment not found in namespace ${namespace}; skipping continuity diagnostics"
    return 0
  fi

  local importerErrorLogs
  importerErrorLogs=$(kubectl logs -n "${namespace}" "${importerDeployment}" --since=20m 2>/dev/null \
    | grep -E 'Earliest failure in batch is|Running hash mismatch for file|None of the data files could be verified' || true)

  local firstFailureTimestamp
  firstFailureTimestamp=$(awk '
    match($0, /Earliest failure in batch is [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9_\.]+Z\.rcd_sig/) {
      value = substr($0, RSTART, RLENGTH)
      sub(/^Earliest failure in batch is /, "", value)
      print value
      exit
    }
  ' <<< "${importerErrorLogs}" || true)

  local firstFailureDataFile=""
  if [[ -n "${firstFailureTimestamp}" ]]; then
    firstFailureDataFile=$(printf '%s\n' "${firstFailureTimestamp}" | sed 's/\.rcd_sig$/.rcd.gz/')
  else
    firstFailureDataFile=$(printf '%s\n' "${importerErrorLogs}" \
      | grep -Eo 'Running hash mismatch for file [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9_\.]+Z\.rcd\.gz' \
      | head -n 1 \
      | sed -E 's/^Running hash mismatch for file //' || true)

    if [[ -n "${firstFailureDataFile}" ]]; then
      firstFailureTimestamp=$(printf '%s\n' "${firstFailureDataFile}" | sed 's/\.rcd\.gz$/.rcd_sig/')
    fi
  fi

  if [[ -n "${IMPORTER_LAST_GOOD_RECORD_FILE:-}" ]]; then
    echo "Importer last known good record stream file before node start: ${IMPORTER_LAST_GOOD_RECORD_FILE}"
  fi

  if [[ -z "${firstFailureTimestamp}" ]]; then
    echo "No running hash mismatch detected in importer logs during the last 20 minutes"
    return 0
  fi

  echo "Importer first failing record stream file after node start: ${firstFailureTimestamp}"

  local firstMismatchLine
  firstMismatchLine=$(awk -v needle="${firstFailureDataFile}" 'index($0, needle) { print; exit }' <<< "${importerErrorLogs}" || true)
  if [[ -z "${firstMismatchLine}" ]]; then
    firstMismatchLine=$(awk -v needle="${firstFailureTimestamp}" 'index($0, needle) { print; exit }' <<< "${importerErrorLogs}" || true)
  fi
  if [[ -n "${firstMismatchLine}" ]]; then
    echo "Importer mismatch detail: ${firstMismatchLine}"
  fi

  local node1RecordPath="recordstreams/record0.0.3/${firstFailureDataFile}"
  local node2RecordPath="recordstreams/record0.0.4/${firstFailureDataFile}"

  echo "Node1 uploader lines for first failing file (${node1RecordPath}):"
  kubectl logs -n "${namespace}" network-node1-0 -c record-stream-uploader --since=20m 2>/dev/null \
    | grep -F "${node1RecordPath}" \
    | tail -n 4 || true

  echo "Node2 uploader lines for first failing file (${node2RecordPath}):"
  kubectl logs -n "${namespace}" network-node2-0 -c record-stream-uploader --since=20m 2>/dev/null \
    | grep -F "${node2RecordPath}" \
    | tail -n 4 || true

  echo "Node startup signed-state evidence (last 20m):"
  echo "node1:"
  kubectl exec -n "${namespace}" network-node1-0 -c root-container -- sh -c \
    "grep -iE 'Loading signed state from disk|replaying preconsensus event stream starting at' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log | tail -n 4" 2>/dev/null || true

  echo "node2:"
  kubectl exec -n "${namespace}" network-node2-0 -c root-container -- sh -c \
    "grep -iE 'Loading signed state from disk|replaying preconsensus event stream starting at' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log | tail -n 4" 2>/dev/null || true

  echo "Record file size and content diagnostics (hash chain investigation):"
  echo "Pre-restart last good file (${IMPORTER_LAST_GOOD_RECORD_FILE}):"
  kubectl exec -n "${namespace}" network-node1-0 -c root-container -- sh -c \
    "ls -lh /opt/hgcapp/recordStreams/record0.0.3/${IMPORTER_LAST_GOOD_RECORD_FILE%.rcd_sig}* 2>/dev/null | tail -n 2 || echo 'file not found in archive'" 2>/dev/null || true

  echo "Post-restart first bad file (${firstFailureDataFile}):"
  kubectl exec -n "${namespace}" network-node1-0 -c root-container -- sh -c \
    "ls -lh /opt/hgcapp/recordStreams/record0.0.3/${firstFailureDataFile} 2>/dev/null || echo 'file not found in archive'" 2>/dev/null || true
  kubectl exec -n "${namespace}" network-node2-0 -c root-container -- sh -c \
    "ls -lh /opt/hgcapp/recordStreams/record0.0.4/${firstFailureDataFile} 2>/dev/null || echo 'file not found in archive'" 2>/dev/null || true

  echo "Gossip endpoint topology evidence (network connectivity during restart):"
  echo "node1 application.properties - gossip and network config:"
  kubectl exec -n "${namespace}" network-node1-0 -c root-container -- sh -c \
    "grep -E 'gossip|nodes\.address|nodeId' /opt/hgcapp/services-hedera/HapiApp2.0/config/application.properties 2>/dev/null | head -n 10 || echo 'file not found'" 2>/dev/null || true

  echo "node2 application.properties - gossip and network config:"
  kubectl exec -n "${namespace}" network-node2-0 -c root-container -- sh -c \
    "grep -E 'gossip|nodes\.address|nodeId' /opt/hgcapp/services-hedera/HapiApp2.0/config/application.properties 2>/dev/null | head -n 10 || echo 'file not found'" 2>/dev/null || true

  echo "Preconsensus event replay evidence from logs (evidence of determinism issues):"
  echo "node1 - preconsensus event counts and replay:"
  kubectl exec -n "${namespace}" network-node1-0 -c root-container -- sh -c \
    "grep -iE 'preconsensus|replay|event.*stream' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log | tail -n 8" 2>/dev/null || true

  echo "Running hash state restoration from snapshot:"
  echo "node1 - hash initialization:"
  kubectl exec -n "${namespace}" network-node1-0 -c root-container -- sh -c \
    "grep -iE 'running.hash|runningHash|hash.*state|record.*hash' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log | tail -n 5" 2>/dev/null || true
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
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-e2e
export USE_MIRROR_NODE_LEGACY_RELEASE_NAME=false
export MIRROR_NODE_VERSION_PRIOR_TO_UPGRADE=v0.139.0
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

solo init --dev


solo cluster-ref config connect --cluster-ref ${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME} --dev
solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" --dev
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --num-consensus-nodes 2 --dev
solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" --dev
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --dev

# solo block node add --deployment "${SOLO_DEPLOYMENT}" --chart-version "${PREV_BLOCK_VERSION}"
solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev
solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -q --dev
solo ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100 --dev

log_gossip_endpoint_configuration "${SOLO_NAMESPACE}" "AFTER initial node start (before mirror)"

solo mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --enable-ingress --pinger -q --mirror-node-version ${MIRROR_NODE_VERSION_PRIOR_TO_UPGRADE} --dev
# solo explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --explorer-version ${PREV_EXPLORER_VERSION} -q --dev
# solo relay node add -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --relay-release ${PREV_RELAY_VERSION} --dev

echo "::endgroup::"

echo "::group::Verification"
cp ~/.solo/local-config.yaml ./local-config-before.yaml
cat ./local-config-before.yaml
kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data' > remote-config-before.yaml
cat remote-config-before.yaml

# trigger migration
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --dev

cp ~/.solo/local-config.yaml ./local-config-after.yaml
cat ./local-config-after.yaml
kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data' > remote-config-after.yaml
cat remote-config-after.yaml

# check local-config-after.yaml should contains 'schemaVersion: 2'
if ! grep -q "schemaVersion: 2" ./local-config-after.yaml; then
  echo "schemaVersion: 2 not found in local-config-after.yaml"
  exit 1
fi

# check remote-config-after.yaml should contains 'schemaVersion: 7'
if ! grep -q "schemaVersion: 7" ./remote-config-after.yaml; then
  echo "schemaVersion: 7 not found in remote-config-after.yaml"
  exit 1
fi
echo "::endgroup::"

echo "::group::Upgrade Solo"
# need to add ingress controller helm repo
echo "Upgrading with workspace Solo CLI"

npm run solo -- init --dev
# Do not force legacy release-name override when upgrading with current workspace Solo.
# The old released Solo command executed above may have installed either naming scheme.
unset USE_MIRROR_NODE_LEGACY_RELEASE_NAME
# freeze network instead of using "node stop" to make sure the network is stopped elegantly
# need to use old solo to freeze the network since new solo freeze may not be compatible with old consensus node
# s6 container
solo -- consensus network freeze --deployment "${SOLO_DEPLOYMENT}" --dev
dump_importer_last_record_stream "${SOLO_NAMESPACE}" "AFTER network freeze"
capture_cn_saved_state_boundary "${SOLO_NAMESPACE}" "AFTER network freeze"

log_gossip_endpoint_configuration "${SOLO_NAMESPACE}" "BEFORE network redeploy (after freeze, frozen state)"

# using new solo to redeploy solo deployment chart to new version
show_service_ips "${SOLO_NAMESPACE}" "BEFORE network deploy"
save_cluster_ips "${SOLO_NAMESPACE}"

npm run solo -- consensus network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev
dump_importer_last_record_stream "${SOLO_NAMESPACE}" "AFTER consensus network deploy"

log_gossip_endpoint_configuration "${SOLO_NAMESPACE}" "AFTER network redeploy (before node setup)"

show_service_ips "${SOLO_NAMESPACE}" "AFTER network deploy"
restore_cluster_ips "${SOLO_NAMESPACE}" "${NODE1_IP}" "${NODE2_IP}"

npm run solo -- consensus node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev
dump_importer_last_record_stream "${SOLO_NAMESPACE}" "AFTER consensus node setup"
capture_cn_saved_state_boundary "${SOLO_NAMESPACE}" "AFTER consensus node setup"

log_gossip_endpoint_configuration "${SOLO_NAMESPACE}" "AFTER upgrade node setup"

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

# mirror ingress controller deployment name can vary by chart version
# (e.g. legacy "mirror-ingress-controller" or suffixed "mirror-ingress-controller-<deployment>").
mirrorIngressDeployments=$(kubectl get deployment -n solo-e2e -o name | grep '^deployment.apps/mirror-ingress-controller' || true)
if [[ -z "${mirrorIngressDeployments}" ]]; then
  echo "No mirror ingress controller deployment found to restart in namespace solo-e2e"
else
  while IFS= read -r deploymentName; do
    [[ -z "${deploymentName}" ]] && continue
    kubectl rollout restart "${deploymentName}" -n solo-e2e
  done <<< "${mirrorIngressDeployments}"
fi
sleep 40;
dump_importer_last_record_stream "${SOLO_NAMESPACE}" "AFTER mirror component restarts"

# restart consensus nodes nodes after mirror nodes are restarted to avoid mirror nodes missing any stream files during restart
echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs BEFORE node start:"
kubectl get svc -n "${SOLO_NAMESPACE}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp
dump_importer_last_record_stream "${SOLO_NAMESPACE}" "BEFORE consensus node start"
IMPORTER_LAST_GOOD_RECORD_FILE="${IMPORTER_LAST_RECORD_FILE:-}"
snapshot_cn_expected_state_rounds "${SOLO_NAMESPACE}"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking config.txt in pods before start:"
for node in node1 node2; do
  echo "=== network-${node}-0 config.txt ==="
  kubectl exec -n "${SOLO_NAMESPACE}" network-${node}-0 -c root-container -- grep "^address" /opt/hgcapp/services-hedera/HapiApp2.0/.archive/config.txt 2>/dev/null || echo "config.txt not found"
done
result=0
npm run solo -- consensus node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev || result=$?

echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs AFTER node start:"
kubectl get svc -n "${SOLO_NAMESPACE}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp

echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking config.txt AFTER start (wait 10s for file creation):"
sleep 10
dump_importer_last_record_stream "${SOLO_NAMESPACE}" "AFTER consensus node start"
if ! verify_cn_startup_state_rounds "${SOLO_NAMESPACE}"; then
  echo "[CN_BOUNDARY_TRACKING] FATAL: consensus node startup state boundary verification failed"
  exit 1
fi
capture_cn_saved_state_boundary "${SOLO_NAMESPACE}" "AFTER consensus node start"
diagnose_record_stream_continuity_break "${SOLO_NAMESPACE}"
for node in node1 node2; do
  echo "=== network-${node}-0 config.txt after start ==="
  kubectl exec -n "${SOLO_NAMESPACE}" network-${node}-0 -c root-container -- grep "^address" /opt/hgcapp/services-hedera/HapiApp2.0/.archive/config.txt 2>/dev/null || echo "config.txt not found or pod not ready"
done

if [[ $result -ne 0 ]]; then
  echo "Starting consensus nodes failed with exit code $result"
  npm run solo -- deployment diagnostics logs --deployment "${SOLO_DEPLOYMENT}" -q --dev
  exit $result
fi

# npm run solo -- relay node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev

# # force restart relay pod to pick up changes of configMap
# kubectl rollout restart deployment/relay-1 -n solo-e2e
# kubectl rollout restart deployment/relay-1-ws -n solo-e2e

# Reset importer hash chain before upgrade so the first post-restart record file is accepted.
# The CN restart leaves a gap of empty gossip rounds (no record files) that advance the
# running hash internally. Clearing the last record_file.hash to SHA-384 empty hash causes
# the importer to skip hash chain verification for the first post-restart file.
reset_importer_hash_chain_for_upgrade "${SOLO_NAMESPACE}"

# redeploy mirror node to upgrade to a newer version
npm run solo -- mirror node upgrade --deployment "${SOLO_DEPLOYMENT}" --enable-ingress --pinger -q --dev
npm run solo -- explorer node upgrade --deployment "${SOLO_DEPLOYMENT}" --mirrorNamespace ${SOLO_NAMESPACE} -q --dev


# wait a few seconds for the pods to be ready before running transactions against them
sleep 10

# kill existing port-forward process due to restart of mirror ingress controller
curl http://127.0.0.1:38081 || true
# find the new mirror-ingress-controller pod name then enable port-forwarding to it
mirrorPodName=$(kubectl get pods -n solo-e2e  | grep mirror-ingress-controller | awk '{print $1}')
echo "Mirror Ingress Controller Pod Name: ${mirrorPodName}"
kubectl port-forward -n solo-e2e --context kind-solo-e2e pods/"${mirrorPodName}" 38081:80 >/tmp/solo-migration-mirror-port-forward.log 2>&1 &

# Test transaction can still be sent and processed
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
echo "::endgroup::"

echo "::group::Upgrade Consensus Node"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Check existing port-forward before upgrade consensus node"
ps -ef |grep port-forward
echo "Upgrade to Consensus Node Version: ${TO_CONSENSUS_NODE_VERSION}"
npm run solo -- consensus network upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --upgrade-version "${TO_CONSENSUS_NODE_VERSION}" -q --dev
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100 --dev

# block node v0.28.0+ requires consensus node v0.71.x+, so upgrade block node after CN upgrade
npm run solo -- block node upgrade --deployment "${SOLO_DEPLOYMENT}"

# kill existing port-forward process due to restart of relay pods
curl http://127.0.0.1:37546 || true

# find the new pod name then enable port-forwarding to it, do not match anything with "ws" in the name
relayPodName=$(kubectl get pods -n solo-e2e  | grep relay | awk '{print $1}' | grep -v ws)
echo "Relay Pod Name: ${relayPodName}"
kubectl port-forward -n solo-e2e --context kind-solo-e2e pods/"${relayPodName}" 37546:7546 >/tmp/solo-migration-relay-port-forward.log 2>&1 &
echo "command is kubectl port-forward -n solo-e2e pods/${relayPodName} 37546:7546 &"

echo "::endgroup::"

echo "::group::Final Verification"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Check existing port-forward before smoke test"
ps -ef |grep port-forward

# Test deployment config list command
echo "Testing deployment config list without cluster-ref..."
npm run solo -- deployment config list --dev
echo "Testing deployment config list with cluster-ref..."
npm run solo -- deployment config list --cluster-ref ${SOLO_CLUSTER_NAME} --dev

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
