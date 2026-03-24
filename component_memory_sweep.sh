#!/bin/bash
set -euo pipefail

SOLO_CLUSTER_NAME="${SOLO_CLUSTER_NAME:-solo}"
SOLO_NAMESPACE="${SOLO_NAMESPACE:-solo}"
SOLO_CLUSTER_SETUP_NAMESPACE="${SOLO_CLUSTER_SETUP_NAMESPACE:-solo-cluster}"
SOLO_DEPLOYMENT="${SOLO_DEPLOYMENT:-solo-deployment}"
NODE_ALIASES="${NODE_ALIASES:-node1}"
LOCAL_BUILD_PATH="${LOCAL_BUILD_PATH:-../hiero-consensus-node/hedera-node/data}"
USE_LOCAL_BUILD="${USE_LOCAL_BUILD:-false}"
RELAY_CHART_DIR="${RELAY_CHART_DIR:-/Users/jeffrey/hiero-json-rpc-relay/charts}"
CONSENSUS_NODE_MEMORY="${CONSENSUS_NODE_MEMORY:-128Mi}"
CONSENSUS_MAX_MEMORY_MI="${CONSENSUS_MAX_MEMORY_MI:-512}"
COMPONENT_MEMORY="${COMPONENT_MEMORY:-64Mi}"
MEMORY_INCREMENT_MI="${MEMORY_INCREMENT_MI:-16}"
CONSENSUS_MEMORY_INCREMENT_MI="${CONSENSUS_MEMORY_INCREMENT_MI:-${MEMORY_INCREMENT_MI}}"
COMPONENT_MAX_MEMORY_MI="${COMPONENT_MAX_MEMORY_MI:-512}"
BLOCK_STREAM_STREAM_MODE="${BLOCK_STREAM_STREAM_MODE:-BLOCKS}"
BLOCK_STREAM_WRITER_MODE="${BLOCK_STREAM_WRITER_MODE:-FILE}"

BLOCK_MEMORY="${BLOCK_MEMORY:-${COMPONENT_MEMORY}}"
BLOCK_MAX_MEMORY_MI="${BLOCK_MAX_MEMORY_MI:-${COMPONENT_MAX_MEMORY_MI}}"

MIRROR_IMPORTER_MEMORY="${MIRROR_IMPORTER_MEMORY:-${COMPONENT_MEMORY}}"
MIRROR_GRPC_MEMORY="${MIRROR_GRPC_MEMORY:-${COMPONENT_MEMORY}}"
MIRROR_REST_MEMORY="${MIRROR_REST_MEMORY:-${COMPONENT_MEMORY}}"
MIRROR_RESTJAVA_MEMORY="${MIRROR_RESTJAVA_MEMORY:-${COMPONENT_MEMORY}}"
MIRROR_WEB3_MEMORY="${MIRROR_WEB3_MEMORY:-${COMPONENT_MEMORY}}"
MIRROR_MONITOR_MEMORY="${MIRROR_MONITOR_MEMORY:-${COMPONENT_MEMORY}}"
MIRROR_MAX_MEMORY_MI="${MIRROR_MAX_MEMORY_MI:-${COMPONENT_MAX_MEMORY_MI}}"

RELAY_MEMORY="${RELAY_MEMORY:-${COMPONENT_MEMORY}}"
RELAY_MAX_MEMORY_MI="${RELAY_MAX_MEMORY_MI:-${COMPONENT_MAX_MEMORY_MI}}"

EXPLORER_MEMORY="${EXPLORER_MEMORY:-${COMPONENT_MEMORY}}"
EXPLORER_MAX_MEMORY_MI="${EXPLORER_MAX_MEMORY_MI:-${COMPONENT_MAX_MEMORY_MI}}"

CONSENSUS_JAVA_HEAP_MIN="${CONSENSUS_JAVA_HEAP_MIN:-32m}"
CONSENSUS_JAVA_HEAP_MAX="${CONSENSUS_JAVA_HEAP_MAX:-64m}"
CONSENSUS_JAVA_DIRECT_MEMORY="${CONSENSUS_JAVA_DIRECT_MEMORY:-32m}"
CONSENSUS_OVERRIDE_JAVA_OPTS="${CONSENSUS_OVERRIDE_JAVA_OPTS:-false}"
CONSENSUS_START_TIMEOUT_SECONDS="${CONSENSUS_START_TIMEOUT_SECONDS:-420}"
BLOCK_ADD_TIMEOUT_SECONDS="${BLOCK_ADD_TIMEOUT_SECONDS:-420}"
MIRROR_ADD_TIMEOUT_SECONDS="${MIRROR_ADD_TIMEOUT_SECONDS:-600}"
RELAY_ADD_TIMEOUT_SECONDS="${RELAY_ADD_TIMEOUT_SECONDS:-420}"
EXPLORER_ADD_TIMEOUT_SECONDS="${EXPLORER_ADD_TIMEOUT_SECONDS:-420}"

TMP_DIR="$(mktemp -d /tmp/solo-mem-sweep.XXXXXX)"
RESULTS_FILE="${RESULTS_FILE:-${PWD}/component-memory-sweep-results.txt}"

trap 'rm -rf "${TMP_DIR}"' EXIT

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
}

solo() {
  BLOCK_STREAM_STREAM_MODE="${BLOCK_STREAM_STREAM_MODE}" \
  BLOCK_STREAM_WRITER_MODE="${BLOCK_STREAM_WRITER_MODE}" \
  npm run solo-test -- "$@"
}

run_solo() {
  log "solo $*"
  solo "$@" >&2
}

run_solo_with_timeout() {
  local timeout_seconds="$1"
  shift

  log "solo $* (timeout ${timeout_seconds}s)"
  solo "$@" >&2 &
  local cmd_pid=$!
  local start_time=$SECONDS

  while kill -0 "${cmd_pid}" >/dev/null 2>&1; do
    if (( SECONDS - start_time >= timeout_seconds )); then
      log "solo $* timed out after ${timeout_seconds}s"
      kill_process_tree "${cmd_pid}"
      wait "${cmd_pid}" >/dev/null 2>&1 || true
      return 124
    fi
    sleep 2
  done

  wait "${cmd_pid}"
}

first_node_alias() {
  local alias="${NODE_ALIASES%%,*}"
  alias="${alias// /}"
  printf '%s' "${alias}"
}

consensus_root_restart_count() {
  local pod_name="$1"
  kubectl --context "kind-${SOLO_CLUSTER_NAME}" get pod "${pod_name}" -n "${SOLO_NAMESPACE}" \
    -o jsonpath='{.status.containerStatuses[?(@.name=="root-container")].restartCount}' 2>/dev/null | tr -d '[:space:]'
}

consensus_root_last_termination_reason() {
  local pod_name="$1"
  kubectl --context "kind-${SOLO_CLUSTER_NAME}" get pod "${pod_name}" -n "${SOLO_NAMESPACE}" \
    -o jsonpath='{.status.containerStatuses[?(@.name=="root-container")].lastState.terminated.reason}' 2>/dev/null | tr -d '[:space:]'
}

run_consensus_start_with_oom_guard() {
  local timeout_seconds="$1"
  local node_alias
  node_alias="$(first_node_alias)"
  local pod_name="network-${node_alias}-0"
  local initial_restart_count
  initial_restart_count="$(consensus_root_restart_count "${pod_name}" || true)"
  if [[ -z "${initial_restart_count}" || ! "${initial_restart_count}" =~ ^[0-9]+$ ]]; then
    initial_restart_count="0"
  fi

  log "solo consensus node start --deployment ${SOLO_DEPLOYMENT} --node-aliases ${NODE_ALIASES} (timeout ${timeout_seconds}s)"
  solo consensus node start --deployment "${SOLO_DEPLOYMENT}" --node-aliases "${NODE_ALIASES}" >&2 &
  local cmd_pid=$!
  local start_time=$SECONDS

  while kill -0 "${cmd_pid}" >/dev/null 2>&1; do
    if (( SECONDS - start_time >= timeout_seconds )); then
      log "solo consensus node start --deployment ${SOLO_DEPLOYMENT} --node-aliases ${NODE_ALIASES} timed out after ${timeout_seconds}s"
      kill_process_tree "${cmd_pid}"
      wait "${cmd_pid}" >/dev/null 2>&1 || true
      return 124
    fi

    local current_restart_count
    current_restart_count="$(consensus_root_restart_count "${pod_name}" || true)"
    local last_termination_reason
    last_termination_reason="$(consensus_root_last_termination_reason "${pod_name}" || true)"
    if [[ "${current_restart_count}" =~ ^[0-9]+$ ]] \
      && (( current_restart_count > initial_restart_count )); then
      if [[ "${last_termination_reason}" == "OOMKilled" ]]; then
        log "Detected OOMKilled for ${pod_name} while starting consensus node; aborting early"
        kill_process_tree "${cmd_pid}"
        wait "${cmd_pid}" >/dev/null 2>&1 || true
        return 125
      fi

      if [[ -n "${last_termination_reason}" ]]; then
        log "Detected restart for ${pod_name} while starting consensus node; reason=${last_termination_reason}"
        kill_process_tree "${cmd_pid}"
        wait "${cmd_pid}" >/dev/null 2>&1 || true
        return 126
      fi
    fi

    sleep 2
  done

  wait "${cmd_pid}"
}

kill_process_tree() {
  local pid="$1"
  local children
  children="$(pgrep -P "${pid}" 2>/dev/null || true)"
  if [[ -n "${children}" ]]; then
    local child
    for child in ${children}; do
      kill_process_tree "${child}"
    done
  fi

  kill -TERM "${pid}" >/dev/null 2>&1 || true
  sleep 1
  kill -KILL "${pid}" >/dev/null 2>&1 || true
}

cleanup_orphan_add_processes() {
  pkill -f "solo.ts block node add" >/dev/null 2>&1 || true
  pkill -f "solo.ts mirror node add" >/dev/null 2>&1 || true
  pkill -f "solo.ts relay node add" >/dev/null 2>&1 || true
  pkill -f "solo.ts explorer node add" >/dev/null 2>&1 || true
}

LAST_FAILURE_REASON=""
LAST_OOM_DETAILS=""

memory_to_mi() {
  local memory="$1"
  if [[ "${memory}" =~ ^([0-9]+)Mi$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi

  log "Unsupported memory format '${memory}'. Expected format like 64Mi."
  return 1
}

increment_memory() {
  local memory="$1"
  local increment_mi="$2"
  local current_mi
  current_mi="$(memory_to_mi "${memory}")" || return 1
  printf '%sMi' "$((current_mi + increment_mi))"
}

increment_memory_var() {
  local var_name="$1"
  local increment_mi="$2"
  local max_memory_mi="$3"

  local current_memory
  eval "current_memory=\${${var_name}}"
  local current_mi
  current_mi="$(memory_to_mi "${current_memory}")" || return 1

  if (( current_mi >= max_memory_mi )); then
    log "${var_name} reached max ${max_memory_mi}Mi and cannot be increased further"
    return 1
  fi

  local next_memory
  next_memory="$(increment_memory "${current_memory}" "${increment_mi}")" || return 1
  printf -v "${var_name}" '%s' "${next_memory}"
  return 0
}

release_oom_details_from_json() {
  jq -r '
    [
      .items[] as $pod |
      ((($pod.status.containerStatuses // []) + ($pod.status.initContainerStatuses // []))[] |
        select(
          (.lastState.terminated.reason // "") == "OOMKilled" or
          (.state.terminated.reason // "") == "OOMKilled"
        ) |
        "\($pod.metadata.name):\(.name)"
      )
    ] | unique | .[]
  '
}

cluster_exists() {
  kind get clusters | rg -qx "${SOLO_CLUSTER_NAME}"
}

latest_release() {
  local prefix="$1"
  helm list -n "${SOLO_NAMESPACE}" -q | rg "^${prefix}" | tail -1 || true
}

wait_release_healthy() {
  local release="$1"
  local timeout_seconds="$2"
  local end_time=$((SECONDS + timeout_seconds))

  LAST_FAILURE_REASON=""
  LAST_OOM_DETAILS=""

  while (( SECONDS < end_time )); do
    local pods_json
    pods_json="$(kubectl get pods -n "${SOLO_NAMESPACE}" -l "app.kubernetes.io/instance=${release}" -o json 2>/dev/null || true)"
    if [[ -z "${pods_json}" ]]; then
      sleep 5
      continue
    fi

    local pod_count
    pod_count="$(jq '[.items[] | select(.status.phase != "Succeeded")] | length' <<<"${pods_json}" 2>/dev/null || echo "0")"
    if [[ "${pod_count}" == "0" ]]; then
      sleep 5
      continue
    fi

    local oom_details
    oom_details="$(release_oom_details_from_json <<<"${pods_json}" || true)"
    if [[ -n "${oom_details}" ]]; then
      LAST_FAILURE_REASON="oom"
      LAST_OOM_DETAILS="${oom_details}"
      log "release ${release} failed: OOMKilled detected"
      log "OOM containers: ${oom_details//$'\n'/, }"
      kubectl get pods -n "${SOLO_NAMESPACE}" -l "app.kubernetes.io/instance=${release}" -o wide >&2 || true
      return 2
    fi

    local all_ready
    all_ready="$(
      jq '
        ([.items[] | select(.status.phase != "Succeeded")] | length) as $count |
        if $count == 0 then
          false
        else
          [
            .items[] | select(.status.phase != "Succeeded") |
            (
              .status.phase == "Running" and
              ((.status.containerStatuses // []) | length > 0) and
              (all((.status.containerStatuses // [])[]; .ready == true))
            )
          ] | all
        end
      ' <<<"${pods_json}"
    )"

    if [[ "${all_ready}" == "true" ]]; then
      sleep 20
      pods_json="$(kubectl get pods -n "${SOLO_NAMESPACE}" -l "app.kubernetes.io/instance=${release}" -o json 2>/dev/null || true)"
      if [[ -z "${pods_json}" ]]; then
        sleep 5
        continue
      fi
      oom_details="$(release_oom_details_from_json <<<"${pods_json}" || true)"
      if [[ -n "${oom_details}" ]]; then
        LAST_FAILURE_REASON="oom"
        LAST_OOM_DETAILS="${oom_details}"
        log "release ${release} failed: OOMKilled detected after stabilization wait"
        log "OOM containers: ${oom_details//$'\n'/, }"
        kubectl get pods -n "${SOLO_NAMESPACE}" -l "app.kubernetes.io/instance=${release}" -o wide >&2 || true
        return 2
      fi
      all_ready="$(
        jq '
          ([.items[] | select(.status.phase != "Succeeded")] | length) as $count |
          if $count == 0 then
            false
          else
            [
              .items[] | select(.status.phase != "Succeeded") |
              (
                .status.phase == "Running" and
                ((.status.containerStatuses // []) | length > 0) and
                (all((.status.containerStatuses // [])[]; .ready == true))
              )
            ] | all
          end
        ' <<<"${pods_json}"
      )"

      if [[ "${all_ready}" == "true" ]]; then
        return 0
      fi
    fi

    sleep 5
  done

  local pods_json
  pods_json="$(kubectl get pods -n "${SOLO_NAMESPACE}" -l "app.kubernetes.io/instance=${release}" -o json 2>/dev/null || true)"
  if [[ -n "${pods_json}" ]]; then
    local oom_details
    oom_details="$(release_oom_details_from_json <<<"${pods_json}" || true)"
    if [[ -n "${oom_details}" ]]; then
      LAST_FAILURE_REASON="oom"
      LAST_OOM_DETAILS="${oom_details}"
      log "release ${release} failed at timeout: OOMKilled detected"
      log "OOM containers: ${oom_details//$'\n'/, }"
      kubectl get pods -n "${SOLO_NAMESPACE}" -l "app.kubernetes.io/instance=${release}" -o wide >&2 || true
      return 2
    fi
  fi

  LAST_FAILURE_REASON="timeout"
  log "release ${release} failed: timeout waiting for healthy pods"
  kubectl get pods -n "${SOLO_NAMESPACE}" -l "app.kubernetes.io/instance=${release}" -o wide >&2 || true
  return 1
}

destroy_all_block() {
  cleanup_orphan_add_processes
  uninstall_releases_by_prefix '^block-node-'
}

destroy_all_mirror() {
  cleanup_orphan_add_processes
  run_solo mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --quiet-mode --dev --force || true
  uninstall_releases_by_prefix '^mirror-'
  uninstall_releases_by_prefix '^haproxy-ingress-'
}

destroy_all_relay() {
  cleanup_orphan_add_processes
  uninstall_releases_by_prefix '^relay-'
}

destroy_all_explorer() {
  cleanup_orphan_add_processes
  uninstall_releases_by_prefix '^explorer'
}

uninstall_releases_by_prefix() {
  local prefix_regex="$1"
  local release
  while IFS= read -r release; do
    [[ -z "${release}" ]] && continue
    log "helm uninstall ${release} -n ${SOLO_NAMESPACE}"
    helm uninstall "${release}" -n "${SOLO_NAMESPACE}" >/dev/null 2>&1 || true
  done < <(helm list -n "${SOLO_NAMESPACE}" -q | rg "${prefix_regex}" || true)
}

write_block_values() {
  local memory="$1"
  local file="$2"
  cat > "${file}" <<EOF
resources:
  requests:
    cpu: "500m"
    memory: "${memory}"
  limits:
    cpu: "1"
    memory: "${memory}"
EOF
}

write_relay_values() {
  local memory="$1"
  local file="$2"
  cat > "${file}" <<EOF
resources:
  requests:
    cpu: 300m
    memory: "${memory}"
  limits:
    cpu: 1100m
    memory: "${memory}"
EOF
}

write_explorer_values() {
  local memory="$1"
  local file="$2"
  cat > "${file}" <<EOF
resources:
  requests:
    cpu: 200m
    memory: "${memory}"
  limits:
    cpu: 1000m
    memory: "${memory}"
EOF
}

write_consensus_values() {
  local consensus_memory="$1"
  local _unused_component_memory="$2"
  local file="$3"
  if [[ "${CONSENSUS_OVERRIDE_JAVA_OPTS}" == "true" ]]; then
    cat > "${file}" <<EOF
defaults:
  root:
    resources:
      requests:
        memory: "${consensus_memory}"
      limits:
        memory: "${consensus_memory}"
    extraEnv:
      - name: JAVA_HEAP_MIN
        value: "${CONSENSUS_JAVA_HEAP_MIN}"
      - name: JAVA_HEAP_MAX
        value: "${CONSENSUS_JAVA_HEAP_MAX}"
      - name: JAVA_OPTS
        value: "-XX:+UseG1GC -XX:MaxDirectMemorySize=${CONSENSUS_JAVA_DIRECT_MEMORY} --add-opens java.base/jdk.internal.misc=ALL-UNNAMED --add-opens java.base/java.nio=ALL-UNNAMED -Dio.netty.tryReflectionSetAccessible=true"
  sidecars:
    blockstreamUploader:
      enabled: false
    recordStreamUploader:
      enabled: false
    eventStreamUploader:
      enabled: false
    backupUploader:
      enabled: false
    otelCollector:
      enabled: false
EOF
  else
    cat > "${file}" <<EOF
defaults:
  root:
    resources:
      requests:
        memory: "${consensus_memory}"
      limits:
        memory: "${consensus_memory}"
  sidecars:
    blockstreamUploader:
      enabled: false
    recordStreamUploader:
      enabled: false
    eventStreamUploader:
      enabled: false
    backupUploader:
      enabled: false
    otelCollector:
      enabled: false
EOF
  fi
}

write_mirror_values() {
  local file="$1"
  cat > "${file}" <<EOF
importer:
  resources:
    requests:
      cpu: 0
      memory: "${MIRROR_IMPORTER_MEMORY}"
    limits:
      cpu: 1000m
      memory: "${MIRROR_IMPORTER_MEMORY}"
grpc:
  resources:
    requests:
      cpu: 0
      memory: "${MIRROR_GRPC_MEMORY}"
    limits:
      cpu: 500m
      memory: "${MIRROR_GRPC_MEMORY}"
rest:
  resources:
    requests:
      cpu: 0
      memory: "${MIRROR_REST_MEMORY}"
    limits:
      cpu: 500m
      memory: "${MIRROR_REST_MEMORY}"
restjava:
  resources:
    requests:
      cpu: 0
      memory: "${MIRROR_RESTJAVA_MEMORY}"
    limits:
      cpu: 500m
      memory: "${MIRROR_RESTJAVA_MEMORY}"
web3:
  resources:
    requests:
      cpu: 0
      memory: "${MIRROR_WEB3_MEMORY}"
    limits:
      cpu: 1000m
      memory: "${MIRROR_WEB3_MEMORY}"
monitor:
  resources:
    requests:
      cpu: 0
      memory: "${MIRROR_MONITOR_MEMORY}"
    limits:
      cpu: 500m
      memory: "${MIRROR_MONITOR_MEMORY}"
EOF
}

add_block() {
  local values_file="$1"
  run_solo_with_timeout "${BLOCK_ADD_TIMEOUT_SECONDS}" block node add --deployment "${SOLO_DEPLOYMENT}" --quiet-mode --dev --values-file "${values_file}"
}

add_mirror() {
  local values_file="$1"
  run_solo_with_timeout "${MIRROR_ADD_TIMEOUT_SECONDS}" mirror node add --deployment "${SOLO_DEPLOYMENT}" --quiet-mode --dev --values-file "${values_file}"
}

add_relay() {
  local values_file="$1"
  run_solo_with_timeout "${RELAY_ADD_TIMEOUT_SECONDS}" relay node add --deployment "${SOLO_DEPLOYMENT}" --node-aliases "${NODE_ALIASES}" --quiet-mode --dev --relay-chart-dir "${RELAY_CHART_DIR}" --values-file "${values_file}"
}

add_explorer() {
  local values_file="$1"
  run_solo_with_timeout "${EXPLORER_ADD_TIMEOUT_SECONDS}" explorer node add --deployment "${SOLO_DEPLOYMENT}" --quiet-mode --dev --namespace "${SOLO_NAMESPACE}" --values-file "${values_file}"
}

sweep_single_memory_component() {
  local component_name="$1"
  local release_prefix="$2"
  local timeout_seconds="$3"
  local destroy_fn="$4"
  local values_fn="$5"
  local add_fn="$6"
  local memory_var="$7"
  local max_memory_mi="$8"
  local increment_mi="$9"

  while true; do
    local current_memory
    eval "current_memory=\${${memory_var}}"
    log "Testing ${component_name} memory limit ${current_memory}"
    cleanup_orphan_add_processes
    "${destroy_fn}"

    local values_file="${TMP_DIR}/${component_name}-${current_memory}.yaml"
    "${values_fn}" "${current_memory}" "${values_file}"

    if "${add_fn}" "${values_file}"; then
      :
    else
      local add_exit_code=$?
      log "${component_name} ${current_memory}: add command failed with exit code ${add_exit_code}"
      local release
      release="$(latest_release "${release_prefix}")"
      if [[ -n "${release}" ]]; then
        if wait_release_healthy "${release}" "${timeout_seconds}"; then
          log "${component_name} ${current_memory}: PASS (post-add health check)"
          printf '%s' "${current_memory}"
          return 0
        fi
        log "${component_name} ${current_memory}: post-add health check failed (${LAST_FAILURE_REASON})"
        if [[ "${LAST_FAILURE_REASON}" == "oom" ]]; then
          if increment_memory_var "${memory_var}" "${increment_mi}" "${max_memory_mi}"; then
            local increased_memory
            eval "increased_memory=\${${memory_var}}"
            log "OOM detected for ${component_name}; increasing ${memory_var} to ${increased_memory}"
            continue
          fi
          log "${component_name}: cannot increase ${memory_var} further"
        fi
      fi
      return 1
    fi

    local release
    release="$(latest_release "${release_prefix}")"
    if [[ -z "${release}" ]]; then
      log "${component_name} ${current_memory}: could not determine Helm release with prefix ${release_prefix}"
      return 1
    fi

    if wait_release_healthy "${release}" "${timeout_seconds}"; then
      log "${component_name} ${current_memory}: PASS"
      printf '%s' "${current_memory}"
      return 0
    fi

    log "${component_name} ${current_memory}: FAIL (${LAST_FAILURE_REASON})"
    if [[ "${LAST_FAILURE_REASON}" == "oom" ]]; then
      if increment_memory_var "${memory_var}" "${increment_mi}" "${max_memory_mi}"; then
        local increased_memory
        eval "increased_memory=\${${memory_var}}"
        log "OOM detected for ${component_name}; increasing ${memory_var} to ${increased_memory}"
        continue
      fi
      log "${component_name}: cannot increase ${memory_var} further"
    fi

    return 1
  done
}

increase_mirror_memory_for_oom() {
  local oom_details="$1"
  local increment_mi="$2"
  local max_memory_mi="$3"

  local changed=0
  local updated_vars=","
  while IFS=: read -r pod_name _container_name; do
    [[ -z "${pod_name}" ]] && continue
    local target_var=""
    case "${pod_name}" in
      mirror-restjava-*)
        target_var="MIRROR_RESTJAVA_MEMORY"
        ;;
      mirror-rest-*)
        target_var="MIRROR_REST_MEMORY"
        ;;
      mirror-grpc-*)
        target_var="MIRROR_GRPC_MEMORY"
        ;;
      mirror-importer-*)
        target_var="MIRROR_IMPORTER_MEMORY"
        ;;
      mirror-web3-*)
        target_var="MIRROR_WEB3_MEMORY"
        ;;
      mirror-monitor-*)
        target_var="MIRROR_MONITOR_MEMORY"
        ;;
      *)
        ;;
    esac

    if [[ -z "${target_var}" ]]; then
      log "OOM detected for '${pod_name}', but no mirror memory variable mapping exists"
      continue
    fi

    if [[ "${updated_vars}" == *",${target_var},"* ]]; then
      continue
    fi

    if increment_memory_var "${target_var}" "${increment_mi}" "${max_memory_mi}"; then
      local updated_memory
      eval "updated_memory=\${${target_var}}"
      log "OOM detected for ${pod_name}; increasing ${target_var} to ${updated_memory}"
      updated_vars="${updated_vars}${target_var},"
      changed=1
    else
      log "OOM detected for ${pod_name}; ${target_var} cannot be increased further"
      return 1
    fi
  done <<<"${oom_details}"

  [[ "${changed}" -eq 1 ]]
}

sweep_mirror_component() {
  local timeout_seconds="$1"
  local increment_mi="$2"
  local max_memory_mi="$3"

  while true; do
    log "Testing mirror memory limits: importer=${MIRROR_IMPORTER_MEMORY}, grpc=${MIRROR_GRPC_MEMORY}, rest=${MIRROR_REST_MEMORY}, restjava=${MIRROR_RESTJAVA_MEMORY}, web3=${MIRROR_WEB3_MEMORY}, monitor=${MIRROR_MONITOR_MEMORY}"
    cleanup_orphan_add_processes
    destroy_all_mirror

    local values_file="${TMP_DIR}/mirror-${MIRROR_IMPORTER_MEMORY}-${MIRROR_GRPC_MEMORY}-${MIRROR_REST_MEMORY}-${MIRROR_RESTJAVA_MEMORY}-${MIRROR_WEB3_MEMORY}-${MIRROR_MONITOR_MEMORY}.yaml"
    write_mirror_values "${values_file}"

    local release
    if add_mirror "${values_file}"; then
      :
    else
      local add_exit_code=$?
      log "mirror add command failed with exit code ${add_exit_code}"
      release="$(latest_release '^mirror-')"
      if [[ -n "${release}" ]]; then
        if wait_release_healthy "${release}" "${timeout_seconds}"; then
          log "mirror: PASS (post-add health check)"
          return 0
        fi
        log "mirror: post-add health check failed (${LAST_FAILURE_REASON})"
        if [[ "${LAST_FAILURE_REASON}" == "oom" ]]; then
          if increase_mirror_memory_for_oom "${LAST_OOM_DETAILS}" "${increment_mi}" "${max_memory_mi}"; then
            continue
          fi
        fi
      fi
      return 1
    fi

    release="$(latest_release '^mirror-')"
    if [[ -z "${release}" ]]; then
      log "mirror: could not determine Helm release with prefix ^mirror-"
      return 1
    fi

    if wait_release_healthy "${release}" "${timeout_seconds}"; then
      log "mirror: PASS"
      return 0
    fi

    log "mirror: FAIL (${LAST_FAILURE_REASON})"
    if [[ "${LAST_FAILURE_REASON}" == "oom" ]]; then
      if increase_mirror_memory_for_oom "${LAST_OOM_DETAILS}" "${increment_mi}" "${max_memory_mi}"; then
        continue
      fi
    fi

    return 1
  done
}

ensure_baseline() {
  if cluster_exists; then
    if kubectl --context "kind-${SOLO_CLUSTER_NAME}" get ns "${SOLO_NAMESPACE}" >/dev/null 2>&1; then
      log "Using existing cluster '${SOLO_CLUSTER_NAME}'"
      cleanup_orphan_add_processes
      if run_consensus_start_with_oom_guard "${CONSENSUS_START_TIMEOUT_SECONDS}"; then
        log "Existing baseline is healthy"
        return
      fi
      log "Existing baseline health check failed, recreating baseline cluster"
    fi
  fi

  log "Creating one-time baseline cluster '${SOLO_CLUSTER_NAME}'"
  cleanup_orphan_add_processes
  kind delete cluster --name "${SOLO_CLUSTER_NAME}" >/dev/null 2>&1 || true
  kind create cluster -n "${SOLO_CLUSTER_NAME}"
  rm -f "${HOME}/.solo/local-config.yaml"
  rm -rf "${HOME}/.solo/cache"/*

  run_solo init
  run_solo cluster-ref config connect --cluster-ref "kind-${SOLO_CLUSTER_NAME}" --context "kind-${SOLO_CLUSTER_NAME}"
  run_solo deployment config create --deployment "${SOLO_DEPLOYMENT}" --namespace "${SOLO_NAMESPACE}"
  run_solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref "kind-${SOLO_CLUSTER_NAME}" --num-consensus-nodes 1
  run_solo cluster-ref config setup --cluster-setup-namespace "${SOLO_CLUSTER_SETUP_NAMESPACE}"
  run_solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" --node-aliases "${NODE_ALIASES}"

  while true; do
    local consensus_values_file="${TMP_DIR}/consensus-memory-values.yaml"
    log "Deploying consensus baseline with CONSENSUS_NODE_MEMORY=${CONSENSUS_NODE_MEMORY}"
    write_consensus_values "${CONSENSUS_NODE_MEMORY}" "${COMPONENT_MEMORY}" "${consensus_values_file}"
    run_solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --node-aliases "${NODE_ALIASES}" --service-monitor true --values-file "${consensus_values_file}"

    local setup_exit=0
    if [[ "${USE_LOCAL_BUILD}" == "true" && -d "${LOCAL_BUILD_PATH}" ]]; then
      if ! run_solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --node-aliases "${NODE_ALIASES}" --local-build-path "${LOCAL_BUILD_PATH}"; then
        setup_exit=$?
      fi
    else
      if ! run_solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --node-aliases "${NODE_ALIASES}"; then
        setup_exit=$?
      fi
    fi

    if (( setup_exit != 0 )); then
      log "Baseline setup failed with CONSENSUS_NODE_MEMORY=${CONSENSUS_NODE_MEMORY} (exit ${setup_exit})"
      if increment_memory_var CONSENSUS_NODE_MEMORY "${CONSENSUS_MEMORY_INCREMENT_MI}" "${CONSENSUS_MAX_MEMORY_MI}"; then
        log "Increasing CONSENSUS_NODE_MEMORY to ${CONSENSUS_NODE_MEMORY} and retrying baseline deployment"
        continue
      fi
      log "Baseline failed: consensus setup could not complete by ${CONSENSUS_MAX_MEMORY_MI}Mi"
      return 1
    fi

    local start_exit=0
    set +e
    run_consensus_start_with_oom_guard "${CONSENSUS_START_TIMEOUT_SECONDS}"
    start_exit=$?
    set -e
    if (( start_exit == 0 )); then
      break
    fi

    if (( start_exit != 124 && start_exit != 125 )); then
      log "Baseline failed with non-memory startup error (exit ${start_exit})."
      log "Hint: set USE_LOCAL_BUILD=false or verify LOCAL_BUILD_PATH build/version compatibility."
      return 1
    fi

    log "Baseline failed to reach ACTIVE with CONSENSUS_NODE_MEMORY=${CONSENSUS_NODE_MEMORY}"
    if increment_memory_var CONSENSUS_NODE_MEMORY "${CONSENSUS_MEMORY_INCREMENT_MI}" "${CONSENSUS_MAX_MEMORY_MI}"; then
      log "Increasing CONSENSUS_NODE_MEMORY to ${CONSENSUS_NODE_MEMORY} and retrying baseline deployment"
      continue
    fi

    log "Baseline failed: consensus node could not reach ACTIVE by ${CONSENSUS_MAX_MEMORY_MI}Mi"
    return 1
  done
}

main() {
  : > "${RESULTS_FILE}"
  log "Memory sweep results will be written to ${RESULTS_FILE}"

  ensure_baseline

  destroy_all_explorer
  destroy_all_relay
  destroy_all_mirror
  destroy_all_block

  local block_best relay_best explorer_best

  block_best="$(sweep_single_memory_component block '^block-node-' 300 destroy_all_block write_block_values add_block BLOCK_MEMORY "${BLOCK_MAX_MEMORY_MI}" "${MEMORY_INCREMENT_MI}" || true)"
  if [[ -n "${block_best}" ]]; then
    echo "block=${block_best}" | tee -a "${RESULTS_FILE}"
  else
    echo "block=NO_STABLE_VALUE_FOUND" | tee -a "${RESULTS_FILE}"
  fi
  destroy_all_block

  if sweep_mirror_component 600 "${MEMORY_INCREMENT_MI}" "${MIRROR_MAX_MEMORY_MI}"; then
    echo "mirror.importer=${MIRROR_IMPORTER_MEMORY}" | tee -a "${RESULTS_FILE}"
    echo "mirror.grpc=${MIRROR_GRPC_MEMORY}" | tee -a "${RESULTS_FILE}"
    echo "mirror.rest=${MIRROR_REST_MEMORY}" | tee -a "${RESULTS_FILE}"
    echo "mirror.restjava=${MIRROR_RESTJAVA_MEMORY}" | tee -a "${RESULTS_FILE}"
    echo "mirror.web3=${MIRROR_WEB3_MEMORY}" | tee -a "${RESULTS_FILE}"
    echo "mirror.monitor=${MIRROR_MONITOR_MEMORY}" | tee -a "${RESULTS_FILE}"
  else
    echo "mirror=NO_STABLE_VALUE_FOUND" | tee -a "${RESULTS_FILE}"
    log "Mirror did not reach a stable value; stopping because relay/explorer depend on mirror."
    exit 1
  fi

  relay_best="$(sweep_single_memory_component relay '^relay-' 420 destroy_all_relay write_relay_values add_relay RELAY_MEMORY "${RELAY_MAX_MEMORY_MI}" "${MEMORY_INCREMENT_MI}" || true)"
  if [[ -n "${relay_best}" ]]; then
    echo "relay=${relay_best}" | tee -a "${RESULTS_FILE}"
  else
    echo "relay=NO_STABLE_VALUE_FOUND" | tee -a "${RESULTS_FILE}"
  fi
  destroy_all_relay

  explorer_best="$(sweep_single_memory_component explorer '^explorer' 420 destroy_all_explorer write_explorer_values add_explorer EXPLORER_MEMORY "${EXPLORER_MAX_MEMORY_MI}" "${MEMORY_INCREMENT_MI}" || true)"
  if [[ -n "${explorer_best}" ]]; then
    echo "explorer=${explorer_best}" | tee -a "${RESULTS_FILE}"
  else
    echo "explorer=NO_STABLE_VALUE_FOUND" | tee -a "${RESULTS_FILE}"
  fi
  destroy_all_explorer

  log "Sweep complete. Summary:"
  cat "${RESULTS_FILE}"
}

main "$@"
