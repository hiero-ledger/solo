#!/bin/bash
# memory-optimizer.sh
#
# Patches container memory limits on a live solo cluster and uses NLG at 10 TPS
# to binary-search the minimum viable memory per component.
#
# Prerequisites: kubectl, npm (solo workspace), jq
# The cluster must already be running — this script does NOT deploy anything.
#
# Usage:
#   # Optimize specific components (comma-separated aliases):
#   ./memory-optimizer.sh --components mirror-grpc,relay,postgres
#
#   # Optimize all known components automatically:
#   ./memory-optimizer.sh --auto
#
#   # List available component aliases and exit:
#   ./memory-optimizer.sh --list
#
# Options:
#   --components ALIAS[,...]  Components to optimize (see --list for valid aliases)
#   --auto                    Optimize all known components
#   --list                    Print component aliases and exit
#   --namespace  NAME         Kubernetes namespace          (default: solo)
#   --deployment NAME         Solo deployment name          (default: solo)
#   --min-memory MI           Memory search lower bound Mi  (default: 128)
#   --max-memory MI           Memory search upper bound Mi  (default: 4096)
#   --granularity MI          Stop when range ≤ this Mi     (default: 64)
#   --tps N                   NLG transactions per second   (default: 10)
#   --duration S              NLG probe duration seconds    (default: 60)

set -eo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────────

SOLO_NAMESPACE="${SOLO_NAMESPACE:-solo}"
SOLO_DEPLOYMENT="${SOLO_DEPLOYMENT:-solo}"
MEMORY_MIN_MI="${MEMORY_MIN_MI:-128}"
MEMORY_MAX_MI="${MEMORY_MAX_MI:-4096}"
MEMORY_GRANULARITY_MI="${MEMORY_GRANULARITY_MI:-64}"
NLG_TPS="${NLG_TPS:-100}"
NLG_DURATION_S="${NLG_DURATION_S:-60}"
NLG_CLIENTS="${NLG_CLIENTS:-5}"
NLG_ACCOUNTS="${NLG_ACCOUNTS:-20}"
NLG_JAVA_HEAP_GB="${NLG_JAVA_HEAP_GB:-4}"
STABILIZE_S="${STABILIZE_S:-15}"
RESULTS_FILE="memory-optimization-$(date '+%Y%m%d-%H%M%S').txt"

# ── Component registry ──────────────────────────────────────────────────────────
# Format: "alias|kind|name_pattern|containers"
#   alias        — short name used with --components
#   kind         — deployment | statefulset
#   name_pattern — grep -E pattern matched against resource names in the namespace
#   containers   — comma-separated container names to optimize, or empty to
#                  auto-discover the first container from the pod spec
#
# When multiple containers are listed (e.g. redis,sentinel) each is optimized
# as a separate binary-search pass against the same workload.

COMPONENT_REGISTRY=(
  "mirror-grpc|deployment|mirror.*grpc|"
  "mirror-importer|deployment|mirror.*importer|"
  "mirror-monitor|deployment|mirror.*monitor|"
  "mirror-rest|deployment|mirror.*-rest$|"
  "mirror-restjava|deployment|mirror.*restjava|"
  "mirror-web3|deployment|mirror.*web3|"
  "network-node|statefulset|^network-node[0-9]|"
  "relay|deployment|^relay-[0-9]+$|"
  "relay-ws|deployment|^relay-[0-9]+-ws$|"
  "postgres|statefulset|solo-shared-resources-postgres|postgresql"
  "redis|statefulset|solo-shared-resources-redis-node|redis,sentinel"
)

# ── Helpers ──────────────────────────────────────────────────────────────────────

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

header() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  printf "  %s\n" "$*"
  echo "════════════════════════════════════════════════════════════"
}

# Lookup a field (2=kind, 3=pattern, 4=containers) for a given alias (field 1)
registry_field() {
  local alias="$1"
  local field="$2"
  local entry
  for entry in "${COMPONENT_REGISTRY[@]}"; do
    local a; a="$(cut -d'|' -f1 <<< "${entry}")"
    if [[ "${a}" == "${alias}" ]]; then
      cut -d'|' -f"${field}" <<< "${entry}"
      return 0
    fi
  done
  echo ""
}

# Print all aliases
list_components() {
  echo "Available component aliases:"
  echo ""
  printf "  %-18s  %-12s  %-40s  %s\n" "ALIAS" "KIND" "NAME PATTERN" "CONTAINERS"
  printf "  %-18s  %-12s  %-40s  %s\n" "-----" "----" "------------" "----------"
  local entry
  for entry in "${COMPONENT_REGISTRY[@]}"; do
    IFS='|' read -r alias kind pattern containers <<< "${entry}"
    containers="${containers:-<auto>}"
    printf "  %-18s  %-12s  %-40s  %s\n" "${alias}" "${kind}" "${pattern}" "${containers}"
  done
  echo ""
}

# Return names of live resources matching a kind + pattern
discover_resources() {
  local kind="$1"
  local pattern="$2"
  kubectl get "${kind}" -n "${SOLO_NAMESPACE}" --no-headers -o name 2>/dev/null \
    | sed 's|.*/||' \
    | grep -E "${pattern}" \
    || true
}

# Return the name of container index 0 from the workload's pod template
auto_discover_container() {
  local kind="$1"
  local name="$2"
  kubectl get "${kind}/${name}" -n "${SOLO_NAMESPACE}" \
    -o jsonpath='{.spec.template.spec.containers[0].name}' 2>/dev/null || echo ""
}

# Return the 0-based index of a named container in the pod template
container_index() {
  local kind="$1"
  local name="$2"
  local container="$3"
  kubectl get "${kind}/${name}" -n "${SOLO_NAMESPACE}" -o json 2>/dev/null \
    | jq --arg c "${container}" \
        '[.spec.template.spec.containers[].name] | index($c) // 0'
}

# Patch one container's memory limit + request on a workload and wait for rollout
set_memory_limit() {
  local kind="$1"
  local name="$2"
  local container="$3"
  local memory_mi="$4"
  local request_mi=$(( memory_mi / 2 ))

  log "  kubectl set resources ${kind}/${name} -c ${container} --limits=memory=${memory_mi}Mi --requests=memory=${request_mi}Mi"

  # Primary: kubectl set resources (handles the container lookup internally)
  if ! kubectl set resources "${kind}/${name}" \
      -n "${SOLO_NAMESPACE}" \
      -c "${container}" \
      --limits="memory=${memory_mi}Mi" \
      --requests="memory=${request_mi}Mi" \
      2>/dev/null; then
    # Fallback: JSON patch using the discovered container index
    local idx
    idx="$(container_index "${kind}" "${name}" "${container}")"
    log "  kubectl set resources failed — falling back to json-patch at container index ${idx}"
    kubectl patch "${kind}/${name}" -n "${SOLO_NAMESPACE}" --type=json -p "$(printf '[
      {"op":"replace","path":"/spec/template/spec/containers/%s/resources/limits/memory","value":"%sMi"},
      {"op":"replace","path":"/spec/template/spec/containers/%s/resources/requests/memory","value":"%sMi"}
    ]' "${idx}" "${memory_mi}" "${idx}" "${request_mi}")"
  fi

  log "  Waiting for rollout of ${kind}/${name}..."
  kubectl rollout status "${kind}/${name}" -n "${SOLO_NAMESPACE}" --timeout=300s
  log "  Stabilizing ${STABILIZE_S}s..."
  sleep "${STABILIZE_S}"
}

# Detect if any pod belonging to a workload has a container that was OOMKilled
check_oom() {
  local resource_name="$1"
  local container="$2"
  # Pods spawned by both Deployments and StatefulSets start with the resource name
  kubectl get pods -n "${SOLO_NAMESPACE}" --no-headers -o name 2>/dev/null \
    | sed 's|pod/||' \
    | grep "^${resource_name}-" \
    | while read -r pod; do
        kubectl get pod "${pod}" -n "${SOLO_NAMESPACE}" \
          -o jsonpath="{.status.containerStatuses[?(@.name==\"${container}\")].lastState.terminated.reason}" \
          2>/dev/null || true
      done \
    | grep -q "OOMKilled" && return 0 || return 1
}

# Run the NLG probe in the background; concurrently watch for OOMKills.
# Returns 0 (pass) or 1 (fail / OOM).
run_nlg_probe() {
  local resource_name="$1"
  local container="$2"

  log "  NLG probe: ${NLG_TPS} TPS for ${NLG_DURATION_S}s (watching ${resource_name}/${container} for OOM)..."

  local nlg_log
  nlg_log="$(mktemp -t nlg-probe-XXXX.log)"

  npm run solo -- rapid-fire load start \
    --deployment "${SOLO_DEPLOYMENT}" \
    --test CryptoTransferLoadTest \
    --max-tps "${NLG_TPS}" \
    --java-heap "${NLG_JAVA_HEAP_GB}" \
    --args "\"-c ${NLG_CLIENTS} -a ${NLG_ACCOUNTS} -t ${NLG_DURATION_S}\"" \
    --quiet-mode \
    >"${nlg_log}" 2>&1 &
  local nlg_pid=$!

  local oom_detected=false
  local elapsed=0
  local poll_interval=10
  local timeout_s=$(( NLG_DURATION_S + 60 ))

  while kill -0 "${nlg_pid}" 2>/dev/null; do
    sleep "${poll_interval}"
    elapsed=$(( elapsed + poll_interval ))

    if check_oom "${resource_name}" "${container}"; then
      log "  OOMKilled detected on ${resource_name}/${container}"
      oom_detected=true
      kill "${nlg_pid}" 2>/dev/null || true
      break
    fi

    if [[ ${elapsed} -gt ${timeout_s} ]]; then
      log "  NLG probe timed out after ${timeout_s}s — treating as failure"
      kill "${nlg_pid}" 2>/dev/null || true
      break
    fi
  done

  local nlg_exit=0
  wait "${nlg_pid}" 2>/dev/null || nlg_exit=$?

  if [[ "${oom_detected}" == "true" || "${nlg_exit}" -ne 0 ]]; then
    log "  Probe FAILED (exit=${nlg_exit}, oom=${oom_detected})"
    tail -20 "${nlg_log}" || true
    rm -f "${nlg_log}"
    return 1
  fi

  log "  Probe PASSED"
  rm -f "${nlg_log}"
  return 0
}

# Binary-search minimum viable memory for one (workload, container) pair.
optimize_one() {
  local kind="$1"
  local name="$2"
  local container="$3"

  header "Optimizing ${kind}/${name}  container: ${container}"

  local low="${MEMORY_MIN_MI}"
  local high="${MEMORY_MAX_MI}"
  local best_mi=0
  local iteration=0

  while [[ $(( high - low )) -gt "${MEMORY_GRANULARITY_MI}" ]]; do
    iteration=$(( iteration + 1 ))
    local mid=$(( (low + high) / 2 ))
    log "Iter ${iteration}: testing ${mid}Mi  [range ${low}–${high}]"

    set_memory_limit "${kind}" "${name}" "${container}" "${mid}"

    if run_nlg_probe "${name}" "${container}"; then
      log "SUCCESS at ${mid}Mi — trying lower"
      best_mi="${mid}"
      high="${mid}"
    else
      log "FAILURE at ${mid}Mi — trying higher"
      low="${mid}"
    fi
  done

  if [[ "${best_mi}" -gt 0 ]]; then
    log "Converged: optimal = ${best_mi}Mi for ${kind}/${name} [${container}]"
    set_memory_limit "${kind}" "${name}" "${container}" "${best_mi}"
    printf "%-14s  %-40s  %-20s  %s\n" "OK" "${kind}/${name}" "${container}" "${best_mi}Mi" \
      >> "${RESULTS_FILE}"
  else
    log "WARNING: no passing value found in [${MEMORY_MIN_MI},${MEMORY_MAX_MI}]Mi for ${kind}/${name} [${container}]"
    printf "%-14s  %-40s  %-20s  %s\n" "NOT FOUND" "${kind}/${name}" "${container}" \
      ">(${MEMORY_MAX_MI}Mi)" >> "${RESULTS_FILE}"
  fi
}

# Resolve alias → discover live resource(s) → optimize each (container pair)
optimize_alias() {
  local alias="$1"
  local kind; kind="$(registry_field "${alias}" 2)"
  local pattern; pattern="$(registry_field "${alias}" 3)"
  local containers_csv; containers_csv="$(registry_field "${alias}" 4)"

  if [[ -z "${kind}" ]]; then
    log "Unknown component alias '${alias}' — use --list to see valid aliases"
    return 1
  fi

  resource_names=()
  while IFS= read -r line; do
    [[ -n "${line}" ]] && resource_names+=("${line}")
  done < <(discover_resources "${kind}" "${pattern}")

  if [[ ${#resource_names[@]} -eq 0 ]]; then
    log "No live ${kind} matching '${pattern}' in namespace ${SOLO_NAMESPACE} — skipping ${alias}"
    printf "%-14s  %-40s  %-20s  %s\n" "SKIPPED" "${kind}/${pattern}" "(not found)" "" \
      >> "${RESULTS_FILE}"
    return 0
  fi

  local name
  for name in "${resource_names[@]}"; do
    # Build container list: explicit CSV or auto-discover
    local containers_to_test=()
    if [[ -n "${containers_csv}" ]]; then
      IFS=',' read -ra containers_to_test <<< "${containers_csv}"
    else
      local discovered
      discovered="$(auto_discover_container "${kind}" "${name}")"
      if [[ -z "${discovered}" ]]; then
        log "Cannot determine container for ${kind}/${name} — skipping"
        continue
      fi
      containers_to_test=("${discovered}")
    fi

    local container
    for container in "${containers_to_test[@]}"; do
      optimize_one "${kind}" "${name}" "${container}"
    done
  done
}

# ── Cleanup trap ────────────────────────────────────────────────────────────────

on_exit() {
  local rc=$?
  if [[ ${rc} -ne 0 ]]; then
    echo "::group::Failure diagnostics"
    kubectl get pods -n "${SOLO_NAMESPACE}" 2>/dev/null || true
    echo "::endgroup::"
  fi
  # Always attempt to stop NLG
  npm run solo -- rapid-fire destroy all \
    --deployment "${SOLO_DEPLOYMENT}" --quiet-mode 2>/dev/null || true
  exit "${rc}"
}

trap on_exit EXIT

# ── Argument parsing ─────────────────────────────────────────────────────────────

MODE=""          # "auto" | "manual"
SELECTED=()      # aliases chosen with --components

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list)
      list_components
      exit 0
      ;;
    --auto)
      MODE="auto"
      shift
      ;;
    --components)
      MODE="manual"
      IFS=',' read -ra SELECTED <<< "$2"
      shift 2
      ;;
    --namespace|-n)    SOLO_NAMESPACE="$2";        shift 2 ;;
    --deployment|-d)   SOLO_DEPLOYMENT="$2";       shift 2 ;;
    --min-memory)      MEMORY_MIN_MI="$2";         shift 2 ;;
    --max-memory)      MEMORY_MAX_MI="$2";         shift 2 ;;
    --granularity)     MEMORY_GRANULARITY_MI="$2"; shift 2 ;;
    --tps)             NLG_TPS="$2";               shift 2 ;;
    --duration)        NLG_DURATION_S="$2";        shift 2 ;;
    *)
      echo "Unknown argument: $1"
      echo "Run with --list to see component aliases, or --help for usage."
      exit 1
      ;;
  esac
done

if [[ -z "${MODE}" ]]; then
  echo "Error: specify --components ALIAS[,...] or --auto"
  echo ""
  list_components
  exit 1
fi

# In auto mode, select all registered aliases
if [[ "${MODE}" == "auto" ]]; then
  for entry in "${COMPONENT_REGISTRY[@]}"; do
    SELECTED+=("$(cut -d'|' -f1 <<< "${entry}")")
  done
fi

# ── Main ────────────────────────────────────────────────────────────────────────

header "Solo Memory Optimizer"
cat <<INFO
  Namespace:    ${SOLO_NAMESPACE}
  Deployment:   ${SOLO_DEPLOYMENT}
  Mode:         ${MODE}
  Components:   ${SELECTED[*]}
  Memory range: ${MEMORY_MIN_MI}Mi – ${MEMORY_MAX_MI}Mi  (granularity ${MEMORY_GRANULARITY_MI}Mi)
  NLG load:     ${NLG_TPS} TPS × ${NLG_DURATION_S}s per probe
  Results file: ${RESULTS_FILE}
INFO

# Init results file
{
  echo "Solo Memory Optimization Results"
  echo "================================="
  echo "Date:       $(date)"
  echo "Namespace:  ${SOLO_NAMESPACE}"
  echo "Deployment: ${SOLO_DEPLOYMENT}"
  echo "NLG TPS:    ${NLG_TPS}"
  echo ""
  printf "%-14s  %-40s  %-20s  %s\n" "STATUS" "RESOURCE" "CONTAINER" "MIN MEMORY"
  printf "%-14s  %-40s  %-20s  %s\n" "------" "--------" "---------" "----------"
} > "${RESULTS_FILE}"

# Optimize selected components one at a time
for alias in "${SELECTED[@]}"; do
  optimize_alias "${alias}"
done

# Print summary
header "Optimization Complete"
cat "${RESULTS_FILE}"
log "Full results written to: ${RESULTS_FILE}"
