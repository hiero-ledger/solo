#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/helper.sh"

TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE=""
TEMP_ONE_SHOT_VALUES_FILE=""
TEMP_MIRROR_NODE_VALUES_FILE=""
TEMP_BLOCK_NODE_VALUES_FILE=""
TEMP_SOURCE_BLOCK_NODE_VALUES_FILE=""
TEMP_SOURCE_APPLICATION_PROPERTIES_FILE=""
TEMP_UPGRADE_CONTEXT_DIR=""

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

  if [[ -n "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE:-}" && -f "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" ]]; then
    rm -f "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"
  fi

  if [[ -n "${TEMP_ONE_SHOT_VALUES_FILE:-}" && -f "${TEMP_ONE_SHOT_VALUES_FILE}" ]]; then
    rm -f "${TEMP_ONE_SHOT_VALUES_FILE}"
  fi

  if [[ -n "${TEMP_MIRROR_NODE_VALUES_FILE:-}" && -f "${TEMP_MIRROR_NODE_VALUES_FILE}" ]]; then
    rm -f "${TEMP_MIRROR_NODE_VALUES_FILE}"
  fi

  if [[ -n "${TEMP_BLOCK_NODE_VALUES_FILE:-}" && -f "${TEMP_BLOCK_NODE_VALUES_FILE}" ]]; then
    rm -f "${TEMP_BLOCK_NODE_VALUES_FILE}"
  fi

  if [[ -n "${TEMP_SOURCE_BLOCK_NODE_VALUES_FILE:-}" && -f "${TEMP_SOURCE_BLOCK_NODE_VALUES_FILE}" ]]; then
    rm -f "${TEMP_SOURCE_BLOCK_NODE_VALUES_FILE}"
  fi

  if [[ -n "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE:-}" && -f "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" ]]; then
    rm -f "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"
  fi

  if [[ -n "${TEMP_UPGRADE_CONTEXT_DIR:-}" && -d "${TEMP_UPGRADE_CONTEXT_DIR}" ]]; then
    rm -rf "${TEMP_UPGRADE_CONTEXT_DIR}"
  fi

  if [[ ${rc} -ne 0 ]]; then
    echo "Test failed, current port forward process: "
    ps -ef | grep port-forward
    collect_failure_diagnostics "${rc}"
  fi

  exit "${rc}"
}

trap on_exit EXIT

set_application_property() {
  local file_path="${1}"
  local key="${2}"
  local value="${3}"

  if grep -q "^${key}=" "${file_path}"; then
    sed -i.bak "s/^${key}=.*/${key}=${value}/" "${file_path}"
  else
    echo "${key}=${value}" >> "${file_path}"
  fi
  rm -f "${file_path}.bak"
}

add_application_properties_overwrite_marker() {
  local file_path="${1}"

  if grep -q '^# SOLO_ENABLE_OVERWRITE=true$' "${file_path}"; then
    return 0
  fi

  local marked_file
  marked_file="$(mktemp -t solo-application-properties-overwrite-XXXX.properties)"
  printf '# SOLO_ENABLE_OVERWRITE=true\n' > "${marked_file}"
  cat "${file_path}" >> "${marked_file}"
  mv "${marked_file}" "${file_path}"
}

is_tss_supported_consensus_version() {
  local consensus_version="${1#v}"
  local minimum_tss_version="0.74.0"

  [[ "$(printf '%s\n' "${minimum_tss_version}" "${consensus_version}" | sort -V | head -n 1)" == "${minimum_tss_version}" ]]
}

version_at_least() {
  local version="${1#v}"
  local minimum_version="${2#v}"

  [[ "$(printf '%s\n' "${minimum_version}" "${version}" | sort -V | head -n 1)" == "${minimum_version}" ]]
}

extract_required_test_version() {
  local variable_name="${1}"
  local version_value=""

  if ! version_value="$(extract_version "${variable_name}" version-test.ts)"; then
    echo "${variable_name} is empty, please check version-test.ts" >&2
    return 1
  fi

  printf '%s' "${version_value}"
}

install_minio_operator_for_source_deploy() {
  local context="kind-${SOLO_CLUSTER_NAME}"
  local namespace="solo-setup"
  local release_name="operator"
  local chart_repo_name="operator"
  local chart_url="${MINIO_OPERATOR_CHART_URL:-https://operator.min.io/}"
  local chart_version="${MINIO_OPERATOR_VERSION:-7.1.1}"

  echo "Installing MinIO operator ${chart_version} for released Solo source deploy"
  helm repo add "${chart_repo_name}" "${chart_url}" --force-update
  helm repo update "${chart_repo_name}"
  helm upgrade --install "${release_name}" "${chart_repo_name}/operator" \
    --create-namespace \
    --namespace "${namespace}" \
    --kube-context "${context}" \
    --version "${chart_version}" \
    --set operator.replicaCount=1 \
    --wait \
    --timeout 5m
  kubectl wait --for=condition=Established crd/tenants.minio.min.io \
    --context "${context}" \
    --timeout=2m
}

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

get_latest_mirror_block_number() {
  local mirror_url="${1:-http://127.0.0.1:38081}"
  local response=""

  response=$(curl -sfS \
    -H 'Cache-Control: no-cache, no-store, must-revalidate' \
    -H 'Pragma: no-cache' \
    -H 'Expires: 0' \
    "${mirror_url}/api/v1/blocks?limit=1&order=desc" || true)

  node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
try {
  const data = JSON.parse(input);
  const value = Number(data.blocks?.[0]?.number);
  console.log(Number.isFinite(value) ? value : -1);
} catch {
  console.log(-1);
}
' <<< "${response}"
}

wait_for_mirror_block_progress() {
  local label="${1}"
  local previous_block="${2:--1}"
  local max_attempts="${3:-90}"
  local sleep_seconds="${4:-2}"
  local latest_block=-1
  local minimum_block=$((previous_block + 1))

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for mirror block ingestion (${label}), minimum block ${minimum_block}" >&2
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    latest_block=$(get_latest_mirror_block_number)
    if [[ "${latest_block}" -ge "${minimum_block}" ]]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Mirror block ingestion ready (${label}): latest block ${latest_block}" >&2
      echo "${latest_block}"
      return 0
    fi

    echo "Mirror block ingestion not ready (${label}) [attempt=${attempt}/${max_attempts}, latest=${latest_block}, minimum=${minimum_block}]" >&2
    sleep "${sleep_seconds}"
  done

  echo "Timed out waiting for mirror block ingestion (${label}); latest=${latest_block}, minimum=${minimum_block}" >&2
  return 1
}

wait_for_mirror_block_count_progress() {
  local label="${1}"
  local previous_block="${2:--1}"
  local required_new_blocks="${3:-1}"
  local max_attempts="${4:-90}"
  local sleep_seconds="${5:-2}"
  local minimum_previous_block=$((previous_block + required_new_blocks - 1))

  wait_for_mirror_block_progress "${label}" "${minimum_previous_block}" "${max_attempts}" "${sleep_seconds}"
}

wait_for_mirror_block_stability() {
  local label="${1}"
  local required_stable_samples="${2:-3}"
  local max_attempts="${3:-60}"
  local sleep_seconds="${4:-2}"
  local latest_block=-1
  local previous_block=-1
  local stable_samples=0

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for mirror block stability (${label})" >&2
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    latest_block=$(get_latest_mirror_block_number)
    if [[ "${latest_block}" -ge 0 && "${latest_block}" -eq "${previous_block}" ]]; then
      stable_samples=$((stable_samples + 1))
    else
      stable_samples=0
      previous_block="${latest_block}"
    fi

    if [[ "${stable_samples}" -ge "${required_stable_samples}" ]]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Mirror block ingestion stable (${label}): latest block ${latest_block}" >&2
      echo "${latest_block}"
      return 0
    fi

    echo "Mirror block ingestion still settling (${label}) [attempt=${attempt}/${max_attempts}, latest=${latest_block}, stable=${stable_samples}/${required_stable_samples}]" >&2
    sleep "${sleep_seconds}"
  done

  echo "Timed out waiting for mirror block stability (${label}); latest=${latest_block}" >&2
  return 1
}

wait_for_consensus_nodes_frozen() {
  local max_attempts="${1:-90}"
  local sleep_seconds="${2:-2}"
  local namespace="${SOLO_NAMESPACE:-one-shot}"
  local context="kind-${SOLO_CLUSTER_NAME:-solo-e2e}"
  local node_pods=("network-node1-0" "network-node2-0")
  local status_line
  local status_number
  local all_frozen

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for source consensus nodes to reach FREEZE_COMPLETE"
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    all_frozen="true"

    for node_pod in "${node_pods[@]}"; do
      status_line="$(kubectl --context "${context}" exec "${node_pod}" -n "${namespace}" -c root-container -- \
        bash -c "curl -s http://localhost:9999/metrics | grep platform_PlatformStatus | grep -v '#'" 2>/dev/null || true)"
      status_number="$(awk '/^platform_PlatformStatus/ {print int($NF); exit}' <<< "${status_line}")"

      if [[ "${status_number}" != "6" ]]; then
        all_frozen="false"
        echo "Consensus node ${node_pod} not frozen yet [attempt=${attempt}/${max_attempts}, status=${status_number:-unknown}]"
        break
      fi
    done

    if [[ "${all_frozen}" == "true" ]]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Source consensus nodes reached FREEZE_COMPLETE"
      return 0
    fi

    sleep "${sleep_seconds}"
  done

  echo "Timed out waiting for source consensus nodes to reach FREEZE_COMPLETE"
  return 1
}

apply_consensus_application_properties_config_map() {
  local properties_file="${1}"
  local namespace="${SOLO_NAMESPACE:-one-shot}"
  local context="kind-${SOLO_CLUSTER_NAME:-solo-e2e}"
  local config_map_name="network-node-data-config-cm"
  local content_json

  content_json="$(jq -Rs . < "${properties_file}")"
  kubectl --context "${context}" get configmap "${config_map_name}" -n "${namespace}" -o json \
    | jq --argjson application_properties "${content_json}" '.data["application.properties"] = $application_properties' \
    | kubectl --context "${context}" apply -f -
}

copy_consensus_application_properties_to_pods() {
  local properties_file="${1}"
  local namespace="${SOLO_NAMESPACE:-one-shot}"
  local context="kind-${SOLO_CLUSTER_NAME:-solo-e2e}"
  local node_pods=("network-node1-0" "network-node2-0")

  for node_pod in "${node_pods[@]}"; do
    if ! kubectl --context "${context}" exec -i "${node_pod}" -n "${namespace}" -c root-container -- \
      bash -c '
        set -euo pipefail
        temp_file="$(mktemp)"
        cat > "${temp_file}"
        wrote="false"

        for properties_dir in /opt/hgcapp/data/config /opt/hgcapp/services-hedera/HapiApp2.0/data/config; do
          if [[ -d "${properties_dir}" ]]; then
            cp "${temp_file}" "${properties_dir}/application.properties"
            chown hedera:hedera "${properties_dir}/application.properties" || true
            chmod 0644 "${properties_dir}/application.properties"
            wrote="true"
          fi
        done

        rm -f "${temp_file}"
        if [[ "${wrote}" != "true" ]]; then
          echo "No consensus application.properties directory exists" >&2
          exit 1
        fi
      ' \
      < "${properties_file}"; then
      echo "Direct application.properties copy failed for ${node_pod}; waiting for config map projection"
    fi
  done
}

copy_consensus_application_properties_from_pod() {
  local properties_file="${1}"
  local namespace="${SOLO_NAMESPACE:-one-shot}"
  local context="kind-${SOLO_CLUSTER_NAME:-solo-e2e}"

  kubectl --context "${context}" exec "network-node1-0" -n "${namespace}" -c root-container -- \
    bash -c '
      for properties_path in /opt/hgcapp/data/config/application.properties /opt/hgcapp/services-hedera/HapiApp2.0/data/config/application.properties; do
        if [[ -f "${properties_path}" ]]; then
          cat "${properties_path}"
          exit 0
        fi
      done

      echo "No consensus application.properties file exists" >&2
      exit 1
    ' > "${properties_file}"
}

wait_for_consensus_application_properties() {
  local expected_wrapped_record_blocks="${1}"
  local expected_hints_enabled="${2}"
  local expected_history_enabled="${3}"
  local expected_wraps_enabled="${4}"
  local expected_cutover_enabled="${5:-}"
  local max_attempts="${6:-30}"
  local sleep_seconds="${7:-2}"
  local namespace="${SOLO_NAMESPACE:-one-shot}"
  local context="kind-${SOLO_CLUSTER_NAME:-solo-e2e}"
  local node_pods=("network-node1-0" "network-node2-0")
  local current_properties
  local all_updated

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    all_updated="true"

    for node_pod in "${node_pods[@]}"; do
      current_properties="$(kubectl --context "${context}" exec "${node_pod}" -n "${namespace}" -c root-container -- \
        bash -c "
          for properties_path in /opt/hgcapp/data/config/application.properties /opt/hgcapp/services-hedera/HapiApp2.0/data/config/application.properties; do
            if [[ -f \"\${properties_path}\" ]]; then
              grep -E '^(blockStream.streamWrappedRecordBlocks|blockStream.enableCutover|tss.hintsEnabled|tss.historyEnabled|tss.wrapsEnabled)=' \"\${properties_path}\"
              exit 0
            fi
          done

          exit 1
        " 2>/dev/null || true)"

      if ! grep -q "^blockStream.streamWrappedRecordBlocks=${expected_wrapped_record_blocks}$" <<< "${current_properties}" \
        || ! grep -q "^tss.hintsEnabled=${expected_hints_enabled}$" <<< "${current_properties}" \
        || ! grep -q "^tss.historyEnabled=${expected_history_enabled}$" <<< "${current_properties}" \
        || ! grep -q "^tss.wrapsEnabled=${expected_wraps_enabled}$" <<< "${current_properties}" \
        || { [[ -n "${expected_cutover_enabled}" ]] && ! grep -q "^blockStream.enableCutover=${expected_cutover_enabled}$" <<< "${current_properties}"; }; then
        all_updated="false"
        echo "Consensus node ${node_pod} application.properties not updated yet [attempt=${attempt}/${max_attempts}]"
        echo "${current_properties}"
        break
      fi
    done

    if [[ "${all_updated}" == "true" ]]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Consensus application.properties updated on all nodes"
      return 0
    fi

    sleep "${sleep_seconds}"
  done

  echo "Timed out waiting for consensus application.properties update"
  return 1
}

run_consensus_network_upgrade() {
  local application_properties_file="${CONSENSUS_UPGRADE_APPLICATION_PROPERTIES_FILE:-${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}}"
  local command=(
    npm run solo --
    consensus network upgrade
    -i node1,node2
    --deployment "${SOLO_DEPLOYMENT}"
    --upgrade-version "${TO_CONSENSUS_NODE_VERSION}"
  )

  if version_at_least "${TO_CONSENSUS_NODE_VERSION}" "v0.73.0"; then
    command+=(--application-properties "${application_properties_file}")
  fi

  command+=(-q --dev)
  "${command[@]}"
}

run_consensus_network_upgrade_prepare() {
  local application_properties_file="${CONSENSUS_UPGRADE_APPLICATION_PROPERTIES_FILE:-${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}}"
  local command=(
    npm run solo --
    consensus dev-node-upgrade prepare
    -i node1,node2
    --deployment "${SOLO_DEPLOYMENT}"
    --upgrade-version "${TO_CONSENSUS_NODE_VERSION}"
    --output-dir "${TEMP_UPGRADE_CONTEXT_DIR}"
  )

  if version_at_least "${TO_CONSENSUS_NODE_VERSION}" "v0.73.0"; then
    command+=(--application-properties "${application_properties_file}")
  fi

  command+=(-q --dev)
  "${command[@]}"
}

run_consensus_network_upgrade_submit() {
  npm run solo -- \
    consensus dev-node-upgrade submit-transactions \
    --deployment "${SOLO_DEPLOYMENT}" \
    --input-dir "${TEMP_UPGRADE_CONTEXT_DIR}" \
    -q --dev
}

run_consensus_network_upgrade_execute() {
  local application_properties_file="${CONSENSUS_UPGRADE_APPLICATION_PROPERTIES_FILE:-${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}}"
  local command=(
    npm run solo --
    consensus dev-node-upgrade execute
    -i node1,node2
    --deployment "${SOLO_DEPLOYMENT}"
    --upgrade-version "${TO_CONSENSUS_NODE_VERSION}"
    --input-dir "${TEMP_UPGRADE_CONTEXT_DIR}"
  )

  if version_at_least "${TO_CONSENSUS_NODE_VERSION}" "v0.73.0"; then
    command+=(--application-properties "${application_properties_file}")
  fi

  command+=(-q --dev)
  "${command[@]}"
}

# Restart relay after upgrade and refresh port-forwards.
refresh_relay_network_config() {
  local namespace="${1}"
  local deployment="${2}"

  echo "[RELAY_RECOVERY] Relay already upgraded; restarting relay deployment to reset SDK node health state"
  kubectl rollout restart deployment/relay-1 deployment/relay-1-ws -n "${namespace}" 2>/dev/null || true

  echo "[RELAY_STABILITY] Waiting for relay deployments to report rolled out"
  kubectl rollout status deployment/relay-1 -n "${namespace}" --timeout=4m --context kind-solo-e2e || return 1
  kubectl rollout status deployment/relay-1-ws -n "${namespace}" --timeout=4m --context kind-solo-e2e || return 1

  echo "[RELAY_STABILITY] Refreshing port-forwards for deployment ${deployment}"
  npm run solo -- deployment refresh port-forwards --deployment "${deployment}"
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
# Temporary workaround tracked in https://github.com/hiero-ledger/solo/issues/4492
# for https://github.com/hiero-ledger/hiero-consensus-node/issues/25486.
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
  currentHash=$(kubectl exec -i -n "${namespace}" "${postgresPod}" -c postgresql -- sh <<EOF
set -euo pipefail
cat > /tmp/.solo-pgpass <<'PGPASS'
localhost:5432:mirror_node:postgres:${pgPassword}
PGPASS
chmod 600 /tmp/.solo-pgpass
PGPASSFILE=/tmp/.solo-pgpass psql -U postgres -d mirror_node -t -A \
  -c "SELECT hash FROM record_file ORDER BY consensus_end DESC LIMIT 1;"
rm -f /tmp/.solo-pgpass
EOF
  ) || currentHash="query_failed"
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
  if ! [[ "${mismatchActualHash}" =~ ^[0-9a-fA-F]{96}$ ]]; then
    echo "[IMPORTER_RESET] Parsed mismatch hash is invalid (expected 96 hex chars); skipping DB hash rewrite"
    return 0
  fi

  echo "[IMPORTER_RESET] Using mismatch Actual hash as bridge value: ${mismatchActualHash}"

  local sqlResult
  sqlResult=$(kubectl exec -i -n "${namespace}" "${postgresPod}" -c postgresql -- sh <<EOF
set -euo pipefail
cat > /tmp/.solo-pgpass <<'PGPASS'
localhost:5432:mirror_node:postgres:${pgPassword}
PGPASS
chmod 600 /tmp/.solo-pgpass
PGPASSFILE=/tmp/.solo-pgpass psql -v ON_ERROR_STOP=1 -U postgres -d mirror_node -t -A \
  -v mismatch_hash="${mismatchActualHash}" <<'SQL'
UPDATE record_file
SET hash = :'mismatch_hash'
WHERE consensus_end = (SELECT MAX(consensus_end) FROM record_file);
SQL
rm -f /tmp/.solo-pgpass
EOF
  ) || sqlResult="SQL_FAILED"

  if [[ "${sqlResult}" == *"SQL_FAILED"* ]] || echo "${sqlResult}" | grep -qi "error"; then
    echo "[IMPORTER_RESET] WARNING: Hash chain reset SQL failed: ${sqlResult}"
    echo "[IMPORTER_RESET] Mirror importer may still experience hash chain mismatch after upgrade"
  else
    echo "[IMPORTER_RESET] Hash chain reset completed (${sqlResult} row updated)"
    echo "[IMPORTER_RESET] Importer last hash realigned to mismatch boundary hash"
  fi
  echo ""
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
  reset_importer_hash_chain_for_upgrade "${namespace}"
  restart_importer_pods_for_recovery "${namespace}"

  if importer_hash_mismatch_detected "${namespace}" "10m"; then
    echo "[IMPORTER_RECOVERY] WARNING: mismatch still present after one-shot recovery"
  else
    echo "[IMPORTER_RECOVERY] Recovery completed; mismatch not observed in recent importer logs"
  fi
}

# Builds a base64-encoded NodeAddressBook JSON string for the BN RSA bootstrap file.
# Queries mirror's /api/v1/network/nodes BEFORE the CN upgrade to capture RSA public
# keys while the address book still has them. After a CN freeze upgrade, file 0.0.101
# is rebuilt without RSA_PubKey entries, so mirror serves empty public_key afterward.
# BN v0.37+ reads rsa-bootstrap-roster.json at startup (app.state.rsaBootstrapFilePath)
# so it can verify WRB blocks without waiting for mirror to re-index RSA keys.
build_bn_rsa_bootstrap_base64() {
  local namespace="${SOLO_NAMESPACE:-one-shot}"
  local context="kind-${SOLO_CLUSTER_NAME:-solo-e2e}"

  # Kind service ClusterIPs are not routable from outside the cluster, so tunnel
  # via kubectl port-forward. Use a random port in the 38000-38999 range.
  local pf_port=$((38000 + RANDOM % 1000))
  kubectl port-forward -n "${namespace}" svc/mirror-1-restjava "${pf_port}":80 \
    --context "${context}" >/dev/null 2>&1 &
  local pf_pid=$!

  # Wait up to 10 s for the port-forward to accept connections.
  local retries=0
  while ! curl -sf --max-time 2 \
      "http://localhost:${pf_port}/api/v1/network/nodes?limit=1" >/dev/null 2>&1; do
    ((retries++)) || true
    if [[ ${retries} -ge 10 ]]; then
      kill "${pf_pid}" 2>/dev/null || true
      wait "${pf_pid}" 2>/dev/null || true
      echo "WARNING: Timed out waiting for port-forward to mirror-1-restjava" >&2
      return 1
    fi
    sleep 1
  done

  local api_response
  api_response=$(curl -sf --max-time 30 \
    "http://localhost:${pf_port}/api/v1/network/nodes?limit=100" 2>&1)
  local query_rc=$?

  kill "${pf_pid}" 2>/dev/null || true
  wait "${pf_pid}" 2>/dev/null || true

  if [[ ${query_rc} -ne 0 ]]; then
    echo "WARNING: Failed to query mirror for RSA keys: ${api_response}" >&2
    return 1
  fi

  # Build RangedAddressBookHistory JSON for BN RSA bootstrap.
  # Mirror returns public_key as hex (possibly with "0x" prefix).
  # BN RsaKeyDecoder expects hex-encoded DER SubjectPublicKeyInfo without "0x" prefix.
  local json
  json=$(echo "${api_response}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
nodes = data.get('nodes', [])
entries = []
for node in nodes:
    nid = node.get('node_id', 0)
    pk = (node.get('public_key', '') or '').strip()
    if pk and pk not in ('0x', ''):
        if pk.startswith('0x'):
            pk = pk[2:]
        entries.append({'nodeId': nid, 'RSAPubKey': pk})
print(json.dumps({'addressBooks': [{'addressBook': {'nodeAddress': entries}, 'startBlock': '0', 'endBlock': '-1'}]}))
" 2>&1)

  local entry_count
  entry_count=$(echo "${json}" | python3 -c \
    "import sys, json; d = json.load(sys.stdin); print(len(d['addressBooks'][0]['addressBook']['nodeAddress']))" 2>/dev/null || echo "0")

  if [[ "${entry_count}" == "0" ]]; then
    echo "WARNING: No valid RSA keys found in mirror response" >&2
    return 1
  fi

  echo "Captured RSA keys for ${entry_count} nodes from mirror before CN upgrade" >&2
  printf '%s' "${json}" | base64 -w0
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
  SOLO_NO_CACHE=true npm install -g @hashgraph/solo@"${fromSoloVersion}" --force
fi

solo --version

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=one-shot
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=one-shot
export SOLO_LOG_LEVEL=debug
PREV_BLOCK_VERSION="$(extract_required_test_version PREV_BLOCK_NODE_VERSION)"
PREV_EXPLORER_VERSION="$(extract_required_test_version PREV_EXPLORER_VERSION)"
PREV_MIRROR_VERSION="$(extract_required_test_version PREV_MIRROR_NODE_VERSION)"
PREV_RELAY_VERSION="$(extract_required_test_version PREV_RELAY_VERSION)"
export PREV_BLOCK_VERSION
export PREV_EXPLORER_VERSION
export PREV_MIRROR_VERSION
export PREV_RELAY_VERSION

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
echo "Block Node Version (previous): ${PREV_BLOCK_VERSION}"
echo "Mirror Node Version (previous): ${PREV_MIRROR_VERSION}"
echo "Explorer Version (previous): ${PREV_EXPLORER_VERSION}"
echo "Relay Version (previous): ${PREV_RELAY_VERSION}"

TEMP_ONE_SHOT_VALUES_FILE="$(mktemp -t falcon-values-migration-XXXX.yaml)"
TEMP_MIRROR_NODE_VALUES_FILE="$(mktemp -t mirror-node-migration-XXXX.yaml)"
TEMP_SOURCE_APPLICATION_PROPERTIES_FILE="$(mktemp -t source-application-properties-XXXX.properties)"

cp resources/templates/application.properties "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"
add_application_properties_overwrite_marker "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"

CURRENT_BLOCK_VERSION="$(extract_version BLOCK_NODE_VERSION version.ts)"
CURRENT_BLOCK_VERSION="${CURRENT_BLOCK_VERSION#v}"
PREV_BLOCK_VERSION_NO_V="${PREV_BLOCK_VERSION#v}"
SOURCE_USES_WRB_RSA="false"
TARGET_USES_WRB_RSA="false"

# CN 0.74 supports block streaming with TSS, but WRB/RSA bootstrap requires BN
# to query mirror REST /api/v1/blocks during the initial one-shot deploy. Mirror
# Java REST does not serve that endpoint in the migration source stack, so keep
# the source deploy on plain block streams and enable WRB/RSA only for CN 0.75+.
if is_tss_supported_consensus_version "${FROM_CONSENSUS_NODE_VERSION}" && \
  version_at_least "${FROM_CONSENSUS_NODE_VERSION}" "v0.75.0" && \
  version_at_least "${PREV_BLOCK_VERSION_NO_V}" "0.37.0" && \
  version_at_least "${CURRENT_BLOCK_VERSION}" "0.37.0"; then
  SOURCE_USES_WRB_RSA="true"
fi

if is_tss_supported_consensus_version "${TO_CONSENSUS_NODE_VERSION}" && \
  version_at_least "${TO_CONSENSUS_NODE_VERSION}" "v0.75.0" && \
  version_at_least "${CURRENT_BLOCK_VERSION}" "0.37.0"; then
  TARGET_USES_WRB_RSA="true"
fi

if ! is_tss_supported_consensus_version "${FROM_CONSENSUS_NODE_VERSION}"; then
  SOURCE_BLOCK_STREAM_MODE="BOTH"
  SOURCE_STREAM_WRAPPED_RECORD_BLOCKS="true"
  SOURCE_BLOCK_STREAM_WRITER_MODE="FILE_AND_GRPC"
  SOURCE_MINIO_ENABLED="true"
  SOURCE_MIRROR_BLOCK_ENABLED="false"
  SOURCE_MIRROR_RECORD_ENABLED="true"
else
  SOURCE_BLOCK_STREAM_WRITER_MODE="FILE_AND_GRPC"
  SOURCE_MINIO_ENABLED="false"
  SOURCE_MIRROR_BLOCK_ENABLED="true"
  SOURCE_MIRROR_RECORD_ENABLED="false"

  if [[ "${SOURCE_USES_WRB_RSA}" == "true" ]]; then
    SOURCE_BLOCK_STREAM_MODE="BOTH"
    SOURCE_STREAM_WRAPPED_RECORD_BLOCKS="true"
  else
    SOURCE_BLOCK_STREAM_MODE="BLOCKS"
    SOURCE_STREAM_WRAPPED_RECORD_BLOCKS="false"
  fi
fi

# WRB/RSA mode uses BLOCKS (BN-only streaming) so CN sends only BLOCK_HEADER native
# blocks to BN. BOTH mode would also send ROUND_HEADER wrapped records to BN, which
# BN 0.38.1 serves to mirror, causing "Incorrect first block item case ROUND_HEADER".
# Mirror reads only from BN (BLOCK_SOURCE_TYPE=BLOCK_NODE), so no file/MinIO needed.
TARGET_BLOCK_STREAM_MODE="BLOCKS"

if [[ "${SOURCE_MIRROR_BLOCK_ENABLED}" == "true" ]]; then
  SOURCE_DISABLE_IMPORTER_SPRING_PROFILES="false"
else
  SOURCE_DISABLE_IMPORTER_SPRING_PROFILES="true"
fi

set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockStream.streamMode" "${SOURCE_BLOCK_STREAM_MODE}"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockStream.streamWrappedRecordBlocks" "${SOURCE_STREAM_WRAPPED_RECORD_BLOCKS}"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockStream.writerMode" "${SOURCE_BLOCK_STREAM_WRITER_MODE}"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockStream.buffer.isBufferPersistenceEnabled" "true"
set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "blockNode.wantedBlockExpirationMillis" "60000"
if is_tss_supported_consensus_version "${FROM_CONSENSUS_NODE_VERSION}"; then
  if [[ "${SOURCE_USES_WRB_RSA}" == "true" ]]; then
    set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.hintsEnabled" "false"
    set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.historyEnabled" "false"
    set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.forceMockSignatures" "false"
    set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.wrapsEnabled" "false"
  else
    set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.hintsEnabled" "true"
    set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.historyEnabled" "true"
    set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.forceMockSignatures" "false"
    set_application_property "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}" "tss.wrapsEnabled" "true"
  fi
fi
chmod 644 "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"

cat > "${TEMP_MIRROR_NODE_VALUES_FILE}" <<EOF
# Generated for migration workflow launch.
importer:
  env:
    HIERO_MIRROR_IMPORTER_BLOCK_ENABLED: "${SOURCE_MIRROR_BLOCK_ENABLED}"
    HIERO_MIRROR_IMPORTER_DOWNLOADER_ALLOW_ANONYMOUS_ACCESS: "true"
    HIERO_MIRROR_IMPORTER_DOWNLOADER_RECORD_ENABLED: "${SOURCE_MIRROR_RECORD_ENABLED}"
    HIERO_MIRROR_IMPORTER_DOWNLOADER_BALANCE_ENABLED: "false"
    HIERO_MIRROR_IMPORTER_BLOCK_FREQUENCY: "2s"
    HIERO_MIRROR_IMPORTER_BLOCK_SOURCE_TYPE: "BLOCK_NODE"
    HIERO_MIRROR_IMPORTER_BLOCK_STREAM_MAX_SUBSCRIBE_ATTEMPTS: "100"
    HIERO_MIRROR_IMPORTER_BLOCK_STREAM_READMIT_DELAY: "10s"
    HEDERA_MIRROR_IMPORTER_BLOCK_ENABLED: "${SOURCE_MIRROR_BLOCK_ENABLED}"
    HEDERA_MIRROR_IMPORTER_DOWNLOADER_ALLOW_ANONYMOUS_ACCESS: "true"
    HEDERA_MIRROR_IMPORTER_DOWNLOADER_RECORD_ENABLED: "${SOURCE_MIRROR_RECORD_ENABLED}"
    HEDERA_MIRROR_IMPORTER_DOWNLOADER_BALANCE_ENABLED: "false"
    HEDERA_MIRROR_IMPORTER_BLOCK_FREQUENCY: "2s"
    HEDERA_MIRROR_IMPORTER_BLOCK_SOURCE_TYPE: "BLOCK_NODE"
    HEDERA_MIRROR_IMPORTER_BLOCK_STREAM_MAX_SUBSCRIBE_ATTEMPTS: "100"
    HEDERA_MIRROR_IMPORTER_BLOCK_STREAM_READMIT_DELAY: "10s"
    SPRING_TASK_SCHEDULING_POOL_SIZE: "1"
  config:
    spring:
      task:
        scheduling:
          pool:
            size: 1
    hedera:
      mirror:
        importer:
          block:
            frequency: 2s
            sourceType: BLOCK_NODE
            stream:
              maxSubscribeAttempts: 100
              readmitDelay: 10s
          downloader:
            allowAnonymousAccess: true
            record:
              enabled: ${SOURCE_MIRROR_RECORD_ENABLED}
            balance:
              enabled: false
    hiero:
      mirror:
        importer:
          block:
            frequency: 2s
            sourceType: BLOCK_NODE
            stream:
              maxSubscribeAttempts: 100
              readmitDelay: 10s
          downloader:
            allowAnonymousAccess: true
            record:
              enabled: ${SOURCE_MIRROR_RECORD_ENABLED}
            balance:
              enabled: false
EOF

if [[ "${SOURCE_USES_WRB_RSA}" == "true" ]]; then
  TEMP_SOURCE_BLOCK_NODE_VALUES_FILE="$(mktemp -t solo-source-block-node-values-XXXX.yaml)"
  cat > "${TEMP_SOURCE_BLOCK_NODE_VALUES_FILE}" <<EOF
# Generated for migration workflow source deploy.
# BN v0.37+ needs RSA public keys to verify WRB blocks from CN v0.75+.
# Mirror v0.156+ serves /api/v1/network/nodes from Java REST, not Node.js REST.
blockNode:
  config:
    ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL: "http://mirror-1-restjava:80"
    ROSTER_BOOTSTRAP_RSA_MN_INITIAL_QUERY_INTERVAL_MILLIS: "1000"
    ROSTER_BOOTSTRAP_RSA_MN_SUBSEQUENT_QUERY_INTERVAL_MILLIS: "10000"
EOF
fi

cat > "${TEMP_ONE_SHOT_VALUES_FILE}" <<EOF
# Generated for migration workflow launch.
network:
  --pvcs: true
  --consensus-node-version: "${FROM_CONSENSUS_NODE_VERSION}"
  --application-properties: "${TEMP_SOURCE_APPLICATION_PROPERTIES_FILE}"

setup:
  --consensus-node-version: "${FROM_CONSENSUS_NODE_VERSION}"

blockNode:
  --consensus-node-version: "${FROM_CONSENSUS_NODE_VERSION}"
EOF

if [[ -n "${TEMP_SOURCE_BLOCK_NODE_VALUES_FILE}" ]]; then
  cat >> "${TEMP_ONE_SHOT_VALUES_FILE}" <<EOF
  --values-file: "${TEMP_SOURCE_BLOCK_NODE_VALUES_FILE}"
EOF
fi

cat >> "${TEMP_ONE_SHOT_VALUES_FILE}" <<EOF

mirrorNode:
  --mirror-node-version: "${PREV_MIRROR_VERSION}"
  --values-file: "${TEMP_MIRROR_NODE_VALUES_FILE}"

relayNode:
  --relay-release: "${PREV_RELAY_VERSION}"

explorerNode:
  --explorer-version: "${PREV_EXPLORER_VERSION}"
EOF

export ONE_SHOT_WITH_BLOCK_NODE=true
# The source deploy uses released Solo, so set stream/minio behavior with generated
# values rather than relying on local source changes.
export BLOCK_STREAM_STREAM_MODE="${SOURCE_BLOCK_STREAM_MODE}"
export BLOCK_STREAM_WRITER_MODE="${SOURCE_BLOCK_STREAM_WRITER_MODE}"
export DISABLE_IMPORTER_SPRING_PROFILES="${SOURCE_DISABLE_IMPORTER_SPRING_PROFILES}"
echo "Initial source block stream mode: ${SOURCE_BLOCK_STREAM_MODE}"
echo "Initial source block stream writer mode: ${SOURCE_BLOCK_STREAM_WRITER_MODE}"
echo "Initial source wrapped record blocks enabled: ${SOURCE_STREAM_WRAPPED_RECORD_BLOCKS}"
echo "Initial source MinIO enabled: ${SOURCE_MINIO_ENABLED}"
echo "Source WRB/RSA mode: ${SOURCE_USES_WRB_RSA}"
echo "Target WRB/RSA mode: ${TARGET_USES_WRB_RSA}"
echo "Target block stream mode: ${TARGET_BLOCK_STREAM_MODE}"

if [[ "${SOURCE_MINIO_ENABLED}" == "true" ]]; then
  install_minio_operator_for_source_deploy
fi

BLOCK_NODE_VERSION="${PREV_BLOCK_VERSION#v}" \
  solo one-shot falcon deploy \
  --num-consensus-nodes 2 \
  --consensus-node-version "${FROM_CONSENSUS_NODE_VERSION}" \
  --values-file "${TEMP_ONE_SHOT_VALUES_FILE}" \
  --no-parallel-deploy

wait_for_mirror_block_progress "source deployment after one-shot" -1 90 2 > /dev/null
source_block_after_one_shot="$(get_latest_mirror_block_number)"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Source mirror block before consensus upgrade: ${source_block_after_one_shot}"

echo "::endgroup::"


echo "::group::Upgrade Consensus Node"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Check existing port-forward before upgrade consensus node"
ps -ef |grep port-forward

echo "Block node version: source=${PREV_BLOCK_VERSION_NO_V}, target=${CURRENT_BLOCK_VERSION}"
MIRROR_NODE_UPGRADED_BEFORE_CONSENSUS="false"

TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE="$(mktemp -t solo-upgrade-application-properties-XXXX.properties)"
cp resources/templates/application.properties "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"
add_application_properties_overwrite_marker "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"

set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "fees.simpleFeesEnabled" "false"
set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.streamMode" "${TARGET_BLOCK_STREAM_MODE}"
set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.writerMode" "FILE_AND_GRPC"
set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.buffer.isBufferPersistenceEnabled" "true"
set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockNode.wantedBlockExpirationMillis" "60000"
# CN v0.75+ compiled default for enableCutover flipped to true (hedera-services#25928).
# Setting true here ensures CN streams only BLOCK_HEADER native blocks post-upgrade.
# Setting false (the pre-v0.75 default) keeps CN in pre-cutover BOTH mode: it also
# emits ROUND_HEADER wrapped records that BN 0.38.1 drops via hasBlockHeader(), which
# creates block number gaps that permanently stall the mirror importer.
if [[ "${TARGET_USES_WRB_RSA}" == "true" ]]; then
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.enableCutover" "true"
else
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.enableCutover" "false"
fi
if [[ "${TARGET_USES_WRB_RSA}" == "true" ]]; then
  # streamWrappedRecordBlocks=false: CN sends BLOCK_HEADER native blocks (with RSA proofs
  # in BLOCK_PROOF) to BN. streamWrappedRecordBlocks=true would cause CN to stream
  # ROUND_HEADER wrapped records which BN 0.38.1 drops via hasBlockHeader(), leaving
  # mirror with no block to consume. RSA verification in BN uses the bootstrapped roster
  # from rsa-bootstrap-roster.json to verify BLOCK_PROOF in BLOCK_HEADER blocks.
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.streamWrappedRecordBlocks" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.hintsEnabled" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.historyEnabled" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.forceMockSignatures" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.wrapsEnabled" "false"
else
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "blockStream.streamWrappedRecordBlocks" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.hintsEnabled" "true"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.historyEnabled" "true"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.forceMockSignatures" "false"
  set_application_property "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}" "tss.wrapsEnabled" "false"
fi
chmod 644 "${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"

CONSENSUS_UPGRADE_APPLICATION_PROPERTIES_FILE="${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"

TEMP_BLOCK_NODE_VALUES_FILE=""

if [[ "${PREV_BLOCK_VERSION_NO_V}" != "${CURRENT_BLOCK_VERSION}" ]]; then
  TEMP_BLOCK_NODE_VALUES_FILE="$(mktemp -t solo-migration-block-node-values-XXXX.yaml)"

  # After a CN freeze upgrade, file 0.0.101 can lose RSA_PubKey entries.
  # Pre-populate BN's rsa-bootstrap-roster.json via an init container so BN
  # versions that need RSA bootstrap have keys ready if WRB mode is enabled later.
  BN_RSA_BOOTSTRAP_B64=""
  if BN_RSA_BOOTSTRAP_B64="$(build_bn_rsa_bootstrap_base64)"; then
    echo "RSA bootstrap data generated for block node init container (${#BN_RSA_BOOTSTRAP_B64} chars)"
  else
    echo "WARNING: RSA bootstrap generation failed; BN will query mirror REST for RSA keys"
  fi

  if [[ -n "${BN_RSA_BOOTSTRAP_B64}" ]]; then
cat > "${TEMP_BLOCK_NODE_VALUES_FILE}" <<EOF
# Generated for the migration workflow.
# /api/v1/network/nodes was moved from Node.js REST to Java REST in mirror v0.156.0+.
# An init container pre-writes rsa-bootstrap-roster.json from mirror's pre-upgrade
# address book so BN has RSA keys ready if WRB mode is enabled after the migration.
blockNode:
  config:
    ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL: "http://mirror-1-restjava:80"
    ROSTER_BOOTSTRAP_RSA_MN_INITIAL_QUERY_INTERVAL_MILLIS: "1000"
    ROSTER_BOOTSTRAP_RSA_MN_SUBSEQUENT_QUERY_INTERVAL_MILLIS: "10000"
  initContainers:
    - name: init-storage-dirs
      image: busybox
      command:
        - sh
        - -c
        - |
          mkdir -p /application-state-pvc && \
          chown 2000:2000 /application-state-pvc && \
          chmod 700 /application-state-pvc && \
          mkdir -p /archive-pvc/archive-data && \
          chown 2000:2000 /archive-pvc/archive-data && \
          chmod 700 /archive-pvc/archive-data && \
          mkdir -p /live-pvc/live-data && \
          chown 2000:2000 /live-pvc/live-data && \
          chmod 700 /live-pvc/live-data
      volumeMounts:
        - name: application-state-storage
          mountPath: /application-state-pvc
        - name: archive-storage
          mountPath: /archive-pvc
        - name: live-storage
          mountPath: /live-pvc
        - name: logging-storage
          mountPath: /logging-pvc
    - name: init-rsa-bootstrap
      image: busybox
      command:
        - sh
        - -c
        - |
          printf '%s' '${BN_RSA_BOOTSTRAP_B64}' | base64 -d > /application-state-pvc/rsa-bootstrap-roster.json && \
          chown 2000:2000 /application-state-pvc/rsa-bootstrap-roster.json && \
          chmod 600 /application-state-pvc/rsa-bootstrap-roster.json
      volumeMounts:
        - name: application-state-storage
          mountPath: /application-state-pvc
EOF
  else
cat > "${TEMP_BLOCK_NODE_VALUES_FILE}" <<EOF
# Generated for the migration workflow.
# /api/v1/network/nodes was moved from Node.js REST to Java REST in mirror v0.156.0+.
blockNode:
  config:
    ROSTER_BOOTSTRAP_RSA_MIRROR_NODE_BASE_URL: "http://mirror-1-restjava:80"
    ROSTER_BOOTSTRAP_RSA_MN_INITIAL_QUERY_INTERVAL_MILLIS: "1000"
    ROSTER_BOOTSTRAP_RSA_MN_SUBSEQUENT_QUERY_INTERVAL_MILLIS: "10000"
EOF
  fi
fi

echo "Using temporary application.properties override file: ${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"
if [[ -n "${TEMP_BLOCK_NODE_VALUES_FILE}" ]]; then
  echo "Using temporary block node values override file: ${TEMP_BLOCK_NODE_VALUES_FILE}"
else
  echo "Block node version unchanged; no temporary block node values override file needed"
fi

if [[ "${TARGET_USES_WRB_RSA}" == "true" && "${MIRROR_NODE_UPGRADED_BEFORE_CONSENSUS}" != "true" ]]; then
  echo "Upgrading mirror node before consensus freeze so the importer can read WRB/RSA blocks after CN+BN upgrade"
  npm run solo -- mirror node upgrade --deployment "${SOLO_DEPLOYMENT}" --enable-ingress --pinger --values-file "${TEMP_MIRROR_NODE_VALUES_FILE}" -q --dev
  MIRROR_NODE_UPGRADED_BEFORE_CONSENSUS="true"
fi

echo "Upgrade to Consensus Node Version: ${TO_CONSENSUS_NODE_VERSION}"

if [[ "${PREV_BLOCK_VERSION_NO_V}" != "${CURRENT_BLOCK_VERSION}" && "${TARGET_USES_WRB_RSA}" == "true" ]]; then
  echo "Consensus and block node versions are both changing; upgrading BN while source CN is frozen"
  TEMP_UPGRADE_CONTEXT_DIR="$(mktemp -d -t solo-upgrade-context-XXXX)"

  echo "Preparing CN ${TO_CONSENSUS_NODE_VERSION} with final WRB/RSA block stream properties."
  CONSENSUS_UPGRADE_APPLICATION_PROPERTIES_FILE="${TEMP_UPGRADE_APPLICATION_PROPERTIES_FILE}"
  run_consensus_network_upgrade_prepare
  run_consensus_network_upgrade_submit
  wait_for_consensus_nodes_frozen 90 2

  frozen_block_before_bn_upgrade="$(wait_for_mirror_block_stability "source frozen before block node upgrade" 3 60 2)"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Stable mirror block before frozen BN upgrade: ${frozen_block_before_bn_upgrade}"

  npm run solo -- block node upgrade --deployment "${SOLO_DEPLOYMENT}" --values-file "${TEMP_BLOCK_NODE_VALUES_FILE}"
  echo "BN ${CURRENT_BLOCK_VERSION} is installed while source CN is frozen."

  run_consensus_network_upgrade_execute
  echo "CN ${TO_CONSENSUS_NODE_VERSION} is active with WRB/RSA block streaming; post-upgrade transaction will verify block progress from ${frozen_block_before_bn_upgrade}."
else
  if [[ "${PREV_BLOCK_VERSION_NO_V}" != "${CURRENT_BLOCK_VERSION}" ]]; then
    npm run solo -- block node upgrade --deployment "${SOLO_DEPLOYMENT}" --values-file "${TEMP_BLOCK_NODE_VALUES_FILE}"
    echo "BN ${CURRENT_BLOCK_VERSION} is installed before the CN upgrade."
  else
    echo "Block node version unchanged (${CURRENT_BLOCK_VERSION}); skipping block node upgrade"
  fi

  run_consensus_network_upgrade
fi

if [[ "${MIRROR_NODE_UPGRADED_BEFORE_CONSENSUS}" != "true" ]]; then
  npm run solo -- mirror node upgrade --deployment "${SOLO_DEPLOYMENT}" --enable-ingress --pinger --values-file "${TEMP_MIRROR_NODE_VALUES_FILE}" -q --dev
else
  echo "Mirror node was upgraded before source CN restart for WRB/RSA block ingestion; skipping duplicate mirror upgrade"
fi
npm run solo -- explorer node upgrade --deployment "${SOLO_DEPLOYMENT}" --mirrorNamespace ${SOLO_NAMESPACE} -q --dev

target_block_before_final_wait="$(get_latest_mirror_block_number)"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Target mirror block before post-upgrade account create: ${target_block_before_final_wait}"

npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100 --dev
wait_for_mirror_block_count_progress "target deployment after component upgrades" "${target_block_before_final_wait}" 1 180 2 > /dev/null

npm run solo -- relay node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev
# Restart relay and refresh forwards after upgrade to reduce stale-connection windows.
refresh_relay_network_config "${SOLO_NAMESPACE}" "${SOLO_DEPLOYMENT}"

echo "::endgroup::"

echo "::group::Final Verification"
SKIP_IMPORTER_CHECK=true
export SMOKE_MIRROR_BLOCK_SETTLE_BLOCKS=3
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
