#!/bin/bash
# memory-optimizer.sh
#
# Binary-searches the minimum viable memory limit for each container in a live
# solo Kubernetes cluster. Components sharing the same probe category are tested
# in parallel — one shared traffic run per round covers all components in the
# group simultaneously. If a component crashes, only its memory floor is raised;
# survivors continue lowering their ceiling in the next round.
#
# Prerequisites: kubectl, npm (solo workspace), jq, awk
# The cluster must already be running — this script does NOT deploy anything.
#
# Usage:
#   # Optimize specific components (comma-separated aliases):
#   ./memory-optimizer.sh --components mirror-grpc,relay,postgres
#
#   # Optimize all components that use a specific probe type (parallel within group):
#   ./memory-optimizer.sh --probe-type nlg        # NLG write path — all nlg components tested together
#   ./memory-optimizer.sh --probe-type query      # mirror read path — all query components tested together
#   ./memory-optimizer.sh --probe-type relay-rpc  # relay JSON-RPC path
#   ./memory-optimizer.sh --probe-type both       # both write paths (network-node)
#   ./memory-optimizer.sh --probe-type none       # observation-only (no probing, apply registry max)
#
#   # Optimize all known components automatically (each probe-type group in sequence):
#   ./memory-optimizer.sh --auto
#
#   # List available component aliases and exit:
#   ./memory-optimizer.sh --list
#
# Options:
#   --components ALIAS[,...]            Components to optimize (see --list)
#   --probe-type TYPE                   Optimize all components of this probe category
#                                         nlg | relay-rpc | query | both | none
#   --auto                              Optimize all known components
#   --list                              Print component aliases and exit
#   --namespace  NAME                   Kubernetes namespace          (default: solo)
#   --deployment NAME                   Solo deployment name          (default: solo)
#   --min-memory MI                     Memory search lower bound Mi  (default: 64)
#   --max-memory MI                     Memory search upper bound Mi  (default: 4096)
#   --granularity MI                    Stop when range ≤ this Mi     (default: 64)
#   --tps N                             NLG/query requests per second (default: 100)
#   --duration S                        NLG probe duration seconds    (default: 300)
#   --query-duration S                  Query probe duration seconds  (default: 60)
#   --nlg-test TYPE                     NLG test class to run         (default: CryptoTransferLoadTest)
#   --skip-preflight                    Skip restoring last_known_good; round 1 probes at live limits
#                                         CryptoTransferLoadTest
#                                         NftTransferLoadTest
#                                         TokenTransferLoadTest
#                                         HCSLoadTest
#                                         SmartContractLoadTest
#
# How the parallel binary search works:
#   1. Components sharing a probe_type are grouped together.
#   2. Each round: every non-converged component is set to its current mid-point memory.
#   3. One shared traffic run starts (NLG, relay-rpc, or per-component query workers).
#      For query: each component gets workers targeting its specific API endpoint —
#        mirror-grpc    → port-forward pod:8081/actuator/health
#        mirror-web3    → port-forward pod:8545/actuator/health
#        mirror-restjava→ ingress /api/v1/network/supply
#        mirror-rest    → ingress /api/v1/network/exchangerate
#        mirror-ingress-controller → ingress /api/v1/network/exchangerate
#   4. All components are monitored simultaneously. Crash detection uses both
#      pod health state and restart-count + finishedAt timestamp to avoid
#      attributing stale OOMs from previous rounds to the current memory setting.
#   5. After the probe window: crashed components raise their low bound (try higher);
#      survivors lower their high bound (new best). Converged components are frozen.
#   6. Repeat until all components in the group converge.

set -eo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────────

SOLO_NAMESPACE="${SOLO_NAMESPACE:-solo}"
SOLO_DEPLOYMENT="${SOLO_DEPLOYMENT:-solo}"
MEMORY_MIN_MI="${MEMORY_MIN_MI:-64}"
MEMORY_MAX_MI="${MEMORY_MAX_MI:-4096}"
MEMORY_GRANULARITY_MI="${MEMORY_GRANULARITY_MI:-96}"
NLG_TPS="${NLG_TPS:-100}"
NLG_DURATION_S="${NLG_DURATION_S:-300}"
QUERY_DURATION_S="${QUERY_DURATION_S:-60}"
NLG_CLIENTS="${NLG_CLIENTS:-5}"
NLG_ACCOUNTS="${NLG_ACCOUNTS:-20}"
NLG_JAVA_HEAP_GB="${NLG_JAVA_HEAP_GB:-4}"
NLG_TEST_CLASS="${NLG_TEST_CLASS:-CryptoTransferLoadTest}"
STABILIZE_S="${STABILIZE_S:-15}"
# Port that solo port-forwards the mirror ingress controller to on localhost
MIRROR_INGRESS_LOCAL_PORT="${MIRROR_INGRESS_LOCAL_PORT:-38081}"
RESULTS_FILE="memory-optimization-$(date '+%Y%m%d-%H%M%S').txt"
NLG_TRAFFIC_LOG="${NLG_TRAFFIC_LOG:-/tmp/nlg-traffic.log}"
SKIP_PREFLIGHT=false  # --skip-preflight: skip pre-flight restores; round 1 probes at live limits

# ── Component registry ──────────────────────────────────────────────────────────
# Format: "alias|kind|name_pattern|containers|max_memory_mi|probe_type"
#   alias         — short name used with --components
#   kind          — deployment | statefulset
#   name_pattern  — grep -E pattern matched against resource names in the namespace
#   containers    — comma-separated container names to optimize, or empty to
#                   auto-discover the first container from the pod spec
#   max_memory_mi — upper bound for binary search (Mi); sourced from resources/*.yaml
#                   (overrides global --max-memory for this component only)
#   probe_type    — which load probe to run during each binary-search iteration:
#                     nlg        NLG CryptoTransferLoadTest → consensus gRPC port 50211
#                     relay-rpc  curl eth_blockNumber loop  → relay HTTP port 7546
#                     query      concurrent HTTP/gRPC read  → mirror service port
#                     both       NLG then relay-rpc; both must pass
#                     none       skip probing (apply memory limit for observation only)
#
# Transaction-path impact table:
#   Component                NLG writes (gRPC)       Relay JSON-RPC          Client queries              probe_type
#   ──────────────────────   ──────────────────────  ──────────────────────  ─────────────────────────   ──────────
#   network-node             DIRECT (consensus)      DIRECT (relay→grpc)     none                        both
#   haproxy-node             DIRECT (entry lb)       DIRECT (entry lb)       none                        nlg
#   envoy-proxy              DIRECT (sidecar proxy)  DIRECT (sidecar proxy)  none                        nlg
#   block-node               DIRECT (record stream)  none                    none                        nlg
#   mirror-importer          DIRECT (record stream)  indirect                none                        nlg
#   postgres                 DIRECT (all writes)     indirect                indirect (reads)            nlg
#   redis                    indirect (cache)        indirect                indirect (cache)            nlg
#   minio                    DIRECT (stream storage) none                    none                        nlg
#   mirror-ingress-controller none                   none                    DIRECT (all REST routing)   query
#   mirror-grpc              none                    none                    DIRECT (gRPC subscriptions) query  → pod:8081/actuator/health
#   mirror-rest              indirect (data source)  indirect (polls REST)   DIRECT (GET /api/v1/*)      query  → ingress /api/v1/network/exchangerate
#   mirror-restjava          indirect (data source)  indirect                DIRECT (GET /api/v1/*)      query  → ingress /api/v1/network/supply
#   mirror-web3              none                    DIRECT (eth_call)       indirect                    query  → pod:8545/actuator/health
#   relay                    none (bypassed)         DIRECT (entry point)    none                        relay-rpc
#   hiero-explorer           none                    none                    none (UI only)              none
#   mirror-monitor           none                    none                    none (pinger only)          none
#   minio-operator           none                    none                    none (control plane)        none
#
# Memory sources (max_memory_mi → stored in resources/*.yaml):
#   mirror-*                resources/mirror-node-values.yaml   <component>.resources.limits.memory
#   network-node            resources/solo-values.yaml          JAVA_HEAP_MAX=6g + JVM overhead → 8192Mi
#   block-node              resources/block-node-values.yaml    resources.limits.memory
#   relay                   resources/relay-values.yaml         relay.resources.limits.memory
#   hiero-explorer          resources/hiero-explorer-values.yaml resources.limits.memory
#   mirror-ingress-ctrl     resources/ingress-controller-values.yaml controller.resources.limits.memory
#   haproxy-node, envoy-proxy, minio — no dedicated values file; limit applied via kubectl set resources
#   minio-operator          lives in solo-setup namespace (field 7 namespace override)
#
# When multiple containers are listed (e.g. redis,sentinel) each is binary-searched
# independently within the same probe round.

# Internal format: alias|kind|pattern|containers|max_mi|probe_type|last_good_mi|last_min_mi|namespace
# Use register_component below — never write entries directly.
COMPONENT_REGISTRY=()

# Register a component into COMPONENT_REGISTRY.
# Required: --alias --kind --pattern --max-mi --probe-type
# Optional: --containers (default: auto-discover)
#           --last-good  (ceiling; default: max-mi)
#           --last-min   (floor;   default: MEMORY_GRANULARITY_MI)
#           --namespace  (default: SOLO_NAMESPACE)
register_component() {
  local alias="" kind="" pattern="" containers="" max_mi="" probe_type=""
  local last_good="" last_min="" namespace=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --alias)       alias="$2";      shift 2 ;;
      --kind)        kind="$2";       shift 2 ;;
      --pattern)     pattern="$2";    shift 2 ;;
      --containers)  containers="$2"; shift 2 ;;
      --max-mi)      max_mi="$2";     shift 2 ;;
      --probe-type)  probe_type="$2"; shift 2 ;;
      --last-good)   last_good="$2";  shift 2 ;;
      --last-min)    last_min="$2";   shift 2 ;;
      --namespace)   namespace="$2";  shift 2 ;;
      *) echo "register_component: unknown argument '$1'" >&2; return 1 ;;
    esac
  done
  COMPONENT_REGISTRY+=("${alias}|${kind}|${pattern}|${containers}|${max_mi}|${probe_type}|${last_good}|${last_min}|${namespace}")
}

# ── Both transaction paths ────────────────────────────────────────────────────
register_component \
  --alias       network-node \
  --kind        statefulset \
  --pattern     "^network-node[0-9]" \
  --max-mi      3000 \
  --probe-type  both \
  --last-good   2012 \
  --last-min    1024

# ── NLG path: CryptoTransfer → gRPC → record stream ─────────────────────────
register_component \
  --alias       haproxy-node \
  --kind        deployment \
  --pattern     "^haproxy-node[0-9]+$" \
  --containers  haproxy \
  --max-mi      90 \
  --probe-type  nlg \
  --last-good   73 \
  --last-min    48

register_component \
  --alias       envoy-proxy \
  --kind        deployment \
  --pattern     "^envoy-proxy-node[0-9]+$" \
  --containers  envoy-proxy \
  --max-mi      90 \
  --probe-type  nlg \
  --last-good   73 \
  --last-min    48

register_component \
  --alias       block-node \
  --kind        statefulset \
  --pattern     "^block-node-[0-9]+$" \
  --containers  block-node-server \
  --max-mi      200 \
  --probe-type  nlg \
  --last-good   140 \
  --last-min    100

register_component \
  --alias       mirror-importer \
  --kind        deployment \
  --pattern     "mirror.*importer" \
  --max-mi      600 \
  --probe-type  nlg \
  --last-good   450 \
  --last-min    400

register_component \
  --alias       postgres \
  --kind        statefulset \
  --pattern     "solo-shared-resources-postgres" \
  --containers  postgresql \
  --max-mi      100 \
  --probe-type  nlg \
  --last-good   75 \
  --last-min    50

register_component \
  --alias       redis \
  --kind        statefulset \
  --pattern     "solo-shared-resources-redis-node" \
  --containers  "redis,sentinel" \
  --max-mi      110 \
  --probe-type  nlg \
  --last-good   90 \
  --last-min    70

register_component \
  --alias       minio \
  --kind        statefulset \
  --pattern     "^minio-pool-[0-9]+$" \
  --containers  minio \
  --max-mi      300 \
  --probe-type  nlg \
  --last-good   250 \
  --last-min    210

# ── Query path: client reads → ingress → mirror REST/gRPC ────────────────────
register_component \
  --alias       mirror-ingress-controller \
  --kind        deployment \
  --pattern     "mirror-ingress-controller.*" \
  --max-mi      150 \
  --probe-type  query \
  --last-good   120 \
  --last-min    100

register_component \
  --alias       mirror-grpc \
  --kind        deployment \
  --pattern     "mirror.*grpc" \
  --max-mi      400 \
  --probe-type  query \
  --last-good   350 \
  --last-min    300

register_component \
  --alias       mirror-rest \
  --kind        deployment \
  --pattern     "mirror.*-rest$" \
  --max-mi      400 \
  --probe-type  query \
  --last-good   350 \
  --last-min    300

register_component \
  --alias       mirror-restjava \
  --kind        deployment \
  --pattern     "mirror.*restjava" \
  --max-mi      500 \
  --probe-type  query \
  --last-good   400 \
  --last-min    300

# ── Relay JSON-RPC path: eth_* → port 7546 → relay ───────────────────────────
register_component \
  --alias       relay \
  --kind        deployment \
  --pattern     "^relay-[0-9]+$" \
  --max-mi      110 \
  --probe-type  relay-rpc \
  --last-good   98 \
  --last-min    80

# ── mirror-web3: EVM simulation requests → pod:8545 ──────────────────────────
register_component \
  --alias       mirror-web3 \
  --kind        deployment \
  --pattern     "mirror.*web3" \
  --max-mi      150 \
  --probe-type  query \
  --last-good   100 \
  --last-min    80

# ── minio sidecar (metrics/console helper, low traffic) ──────────────────────
register_component \
  --alias       minio-sidecar \
  --kind        statefulset \
  --pattern     "^minio-pool-[0-9]+$" \
  --containers  sidecar \
  --max-mi      128 \
  --probe-type  nlg \
  --last-good   112 \
  --last-min    96

# ── network-node sidecar containers (stream uploaders + telemetry) ────────────
register_component \
  --alias       blockstream-uploader \
  --kind        statefulset \
  --pattern     "^network-node[0-9]" \
  --containers  blockstream-uploader \
  --max-mi      128 \
  --probe-type  nlg \
  --last-good   112 \
  --last-min    96

register_component \
  --alias       record-stream-uploader \
  --kind        statefulset \
  --pattern     "^network-node[0-9]" \
  --containers  record-stream-uploader \
  --max-mi      128 \
  --probe-type  nlg \
  --last-good   112 \
  --last-min    96

register_component \
  --alias       event-stream-uploader \
  --kind        statefulset \
  --pattern     "^network-node[0-9]" \
  --containers  event-stream-uploader \
  --max-mi      128 \
  --probe-type  nlg \
  --last-good   112 \
  --last-min    96

register_component \
  --alias       otel-collector \
  --kind        statefulset \
  --pattern     "^network-node[0-9]" \
  --containers  otel-collector \
  --max-mi      128 \
  --probe-type  nlg \
  --last-good   112 \
  --last-min    96


# ── Observation-only: no meaningful load impact ───────────────────────────────
register_component \
  --alias       hiero-explorer \
  --kind        deployment \
  --pattern     "hiero-explorer.*" \
  --containers  hiero-explorer-chart \
  --max-mi      300 \
  --probe-type  none \
  --last-good   250 \
  --last-min    200

register_component \
  --alias       mirror-monitor \
  --kind        deployment \
  --pattern     "mirror.*monitor" \
  --max-mi      600 \
  --probe-type  none \
  --last-good   470 \
  --last-min    400

# minio-operator runs in a fixed cluster-setup namespace, not the deployment namespace
register_component \
  --alias       minio-operator \
  --kind        deployment \
  --pattern     "^minio-operator$" \
  --containers  operator \
  --max-mi      128 \
  --probe-type  none \
  --last-good   128 \
  --namespace   solo-setup

# ── Helpers ──────────────────────────────────────────────────────────────────────

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

header() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  printf "  %s\n" "$*"
  echo "════════════════════════════════════════════════════════════"
}

# Lookup a field by number for a given alias.
# Field positions: 1=alias 2=kind 3=pattern 4=containers 5=max_mi 6=probe_type 7=last_good_mi 8=last_min_mi 9=namespace
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
  printf "  %-18s  %-12s  %-34s  %-20s  %-12s  %-12s  %-12s  %s\n" "ALIAS" "KIND" "NAME PATTERN" "CONTAINERS" "PROBE" "MAX MEMORY" "LAST GOOD" "LAST MIN"
  printf "  %-18s  %-12s  %-34s  %-20s  %-12s  %-12s  %-12s  %s\n" "-----" "----" "------------" "----------" "-----" "----------" "---------" "--------"
  local entry
  for entry in "${COMPONENT_REGISTRY[@]}"; do
    IFS='|' read -r alias kind pattern containers max_mi probe_type last_known_good_mi last_known_min_mi _ns <<< "${entry}"
    containers="${containers:-<auto>}"
    local max_display
    if [[ -n "${max_mi}" ]]; then
      max_display="${max_mi}Mi"
    else
      max_display="${MEMORY_MAX_MI}Mi (global default)"
    fi
    local lkg_display="${last_known_good_mi:+${last_known_good_mi}Mi}"; lkg_display="${lkg_display:-same as max}"
    local lkm_display="${last_known_min_mi:+${last_known_min_mi}Mi}"; lkm_display="${lkm_display:-granularity}"
    printf "  %-18s  %-12s  %-34s  %-20s  %-12s  %-12s  %-12s  %s\n" \
      "${alias}" "${kind}" "${pattern}" "${containers}" "${probe_type:-nlg}" "${max_display}" "${lkg_display}" "${lkm_display}"
  done
  echo ""
}

# Return names of live resources matching a kind + pattern
discover_resources() {
  local kind="$1"
  local pattern="$2"
  local ns="${3:-${SOLO_NAMESPACE}}"
  kubectl get "${kind}" -n "${ns}" --no-headers -o name 2>/dev/null \
    | sed 's|.*/||' \
    | grep -E "${pattern}" \
    || true
}

# Return the name of container index 0 from the workload's pod template
auto_discover_container() {
  local kind="$1"
  local name="$2"
  local ns="${3:-${SOLO_NAMESPACE}}"
  kubectl get "${kind}/${name}" -n "${ns}" \
    -o jsonpath='{.spec.template.spec.containers[0].name}' 2>/dev/null || echo ""
}

# Read the current memory limit (in Mi) for a named container from the live workload spec.
# Handles values in Mi ("512Mi") and Gi ("2Gi"). Returns empty string on failure.
get_current_memory_limit_mi() {
  local kind="$1"
  local name="$2"
  local container="$3"
  local ns="${4:-${SOLO_NAMESPACE}}"
  local raw
  raw=$(kubectl get "${kind}/${name}" -n "${ns}" -o json 2>/dev/null \
    | jq -r --arg c "${container}" '
        .spec.template.spec.containers[]?
        | select(.name == $c)
        | .resources.limits.memory // ""
      ' 2>/dev/null || echo "")
  [[ -z "${raw}" ]] && echo "" && return

  # Convert to Mi: accept plain Mi, Gi, M, G
  if echo "${raw}" | grep -qiE '^[0-9]+Gi?$'; then
    local gi; gi=$(echo "${raw}" | tr -d 'GiG')
    echo $(( gi * 1024 ))
  elif echo "${raw}" | grep -qiE '^[0-9]+Mi?$'; then
    echo "${raw}" | tr -d 'MiM'
  else
    echo ""
  fi
}

# Return the 0-based index of a named container in the pod template
container_index() {
  local kind="$1"
  local name="$2"
  local container="$3"
  local ns="${4:-${SOLO_NAMESPACE}}"
  kubectl get "${kind}/${name}" -n "${ns}" -o json 2>/dev/null \
    | jq --arg c "${container}" \
        '[.spec.template.spec.containers[].name] | index($c) // 0'
}

# Poll pods belonging to a workload for actively unhealthy states.
# Only inspects CURRENT state — never lastState, which reflects the previous
# pod lifecycle and produces false positives after normal rollout restarts.
#
# Returns 0 (bad state found) or 1 (all pods healthy / not yet scheduled).
check_pod_health() {
  local resource_name="$1"
  local container="$2"
  local ns="${3:-${SOLO_NAMESPACE}}"

  local pod
  while IFS= read -r pod; do
    [[ -z "${pod}" ]] && continue

    local pod_json
    pod_json=$(kubectl get pod "${pod}" -n "${ns}" -o json 2>/dev/null) || continue

    # Phase-level failure
    local phase
    phase=$(echo "${pod_json}" | jq -r '.status.phase // ""')
    if [[ "${phase}" == "Failed" ]]; then
      log "  Pod ${pod} in Failed phase"
      return 0
    fi

    # Current waiting reason — CrashLoopBackOff means the container keeps dying
    local waiting_reason
    waiting_reason=$(echo "${pod_json}" | jq -r --arg c "${container}" '
      .status.containerStatuses[]?
      | select(.name == $c)
      | .state.waiting.reason // ""
    ' 2>/dev/null || echo "")

    if echo "${waiting_reason}" | grep -qE "CrashLoopBackOff|OOMKilled|CreateContainerError"; then
      log "  Pod ${pod} container ${container}: ${waiting_reason}"
      return 0
    fi

    # Current terminated reason — OOMKilled while the new pod is still terminating
    local terminated_reason
    terminated_reason=$(echo "${pod_json}" | jq -r --arg c "${container}" '
      .status.containerStatuses[]?
      | select(.name == $c)
      | .state.terminated.reason // ""
    ' 2>/dev/null || echo "")

    if [[ "${terminated_reason}" == "OOMKilled" ]]; then
      log "  Pod ${pod} container ${container}: OOMKilled (current state)"
      return 0
    fi

  done < <(kubectl get pods -n "${ns}" --no-headers -o name 2>/dev/null \
    | sed 's|pod/||' | grep "^${resource_name}-")

  return 1
}

# Check whether a specific pod's container was OOMKilled in its LAST termination.
# Safe to call only after confirming a restart count increase — otherwise lastState
# reflects normal rollout restarts and produces false positives.
# Returns 0 if last termination was OOMKilled, 1 otherwise.
check_last_termination_oom() {
  local pod_name="$1"
  local container="$2"
  local ns="${3:-${SOLO_NAMESPACE}}"
  local reason
  reason=$(kubectl get pod "${pod_name}" -n "${ns}" \
    -o jsonpath="{.status.containerStatuses[?(@.name==\"${container}\")].lastState.terminated.reason}" \
    2>/dev/null || echo "")
  if [[ "${reason}" == "OOMKilled" ]]; then
    log "  Pod ${pod_name} container ${container}: lastState.terminated.reason=OOMKilled"
    return 0
  fi
  return 1
}

# Returns 0 if restartCount increased AND the last termination finished after
# probe_start_time — meaning the crash happened during THIS probe, not a leftover
# from a previous iteration.
is_new_crash_since() {
  local pod_name="$1"
  local container="$2"
  local restart_count_before="$3"
  local probe_start_time="$4"
  local ns="${5:-${SOLO_NAMESPACE}}"

  local restart_count_after
  restart_count_after=$(kubectl get pod "${pod_name}" -n "${ns}" \
    -o jsonpath="{.status.containerStatuses[?(@.name==\"${container}\")].restartCount}" \
    2>/dev/null || echo "0")
  restart_count_after="${restart_count_after:-0}"

  if [[ "${restart_count_after}" -le "${restart_count_before}" ]]; then
    echo "${restart_count_after}"
    return 1
  fi

  # Restart count increased — verify the termination happened after the probe started
  local finished_at
  finished_at=$(kubectl get pod "${pod_name}" -n "${ns}" \
    -o jsonpath="{.status.containerStatuses[?(@.name==\"${container}\")].lastState.terminated.finishedAt}" \
    2>/dev/null || echo "")

  if [[ -z "${finished_at}" ]]; then
    # finishedAt not populated yet — trust the count increase
    echo "${restart_count_after}"
    return 0
  fi

  # Compare timestamps lexicographically (both are RFC3339/ISO8601 UTC strings)
  if [[ "${finished_at}" > "${probe_start_time}" ]]; then
    echo "${restart_count_after}"
    return 0
  fi

  # Restart count went up but the termination time predates this probe — stale OOM
  # from a previous iteration. Do not count it.
  log "  Restart count ${restart_count_before}→${restart_count_after} but lastState.finishedAt=${finished_at} predates probe start ${probe_start_time} — stale restart, ignoring"
  echo "${restart_count_after}"
  return 1
}

# Kill all persist-port-forward processes whose command line references a given
# deployment/statefulset name (wildcard prefix match).  Solo hard-codes the pod
# name into each process; after a pod restart the old process becomes a zombie
# targeting a gone pod.  Kill them all before patching so they don't accumulate.
_kill_portforwards_for() {
  local name="$1"   # e.g. "haproxy-node1"
  local pids
  # Match any persist-port-forward line that contains the component name.
  # Use grep -v grep to exclude the grep itself.
  pids=$(ps -ef | grep "persist-port-forward" | grep "${name}" | grep -v grep \
    | awk '{print $2}' || true)
  if [[ -n "${pids}" ]]; then
    log "  Killing stale port-forward processes for ${name}: ${pids}"
    echo "${pids}" | xargs kill 2>/dev/null || true
  fi
}

# Apply a memory limit patch to one container — does NOT wait for rollout.
# Call wait_for_rollouts after applying all components in a round.
apply_memory_limit() {
  local kind="$1"
  local name="$2"
  local container="$3"
  local memory_mi="$4"
  local ns="${5:-${SOLO_NAMESPACE}}"
  local request_mi=$(( memory_mi / 2 ))

  # Kill stale port-forward processes for this component before patching.
  # After the rollout the pod gets a new name/IP; old port-forwards become zombies.
  _kill_portforwards_for "${name}"

  log "  kubectl set resources ${kind}/${name} -c ${container} --limits=memory=${memory_mi}Mi --requests=memory=${request_mi}Mi"

  if ! kubectl set resources "${kind}/${name}" \
      -n "${ns}" \
      -c "${container}" \
      --limits="memory=${memory_mi}Mi" \
      --requests="memory=${request_mi}Mi" \
      2>/dev/null; then
    local idx
    idx="$(container_index "${kind}" "${name}" "${container}" "${ns}")"
    log "  kubectl set resources failed — falling back to json-patch at container index ${idx}"
    kubectl patch "${kind}/${name}" -n "${ns}" --type=json -p "$(printf '[
      {"op":"replace","path":"/spec/template/spec/containers/%s/resources/limits/memory","value":"%sMi"},
      {"op":"replace","path":"/spec/template/spec/containers/%s/resources/requests/memory","value":"%sMi"}
    ]' "${idx}" "${memory_mi}" "${idx}" "${request_mi}")"
  fi
}

# Wait for all _cg_ components to finish rolling out in parallel, watching for crashes.
# Populates _cg_crashed[$i]=true for any component that OOMKills during rollout.
# Returns 1 if any component crashed, 0 if all rolled out cleanly.
wait_for_rollouts() {
  local ns_arg="${1:-}"
  local rollout_pids=()
  local i

  # Launch all rollout-status watchers in parallel
  for i in $(seq 0 $(( _cg_count - 1 ))); do
    [[ "${_cg_converged[$i]}" == "true" ]] && rollout_pids+=("") && continue
    [[ "${_cg_crashed[$i]}" == "true" ]]   && rollout_pids+=("") && continue
    kubectl rollout status "${_cg_kind[$i]}/${_cg_name[$i]}" \
      -n "${_cg_ns[$i]}" --timeout=300s >/dev/null 2>&1 &
    rollout_pids+=($!)
  done

  log "  Waiting for rollouts to complete (monitoring for OOMKilled/CrashLoopBackOff)..."
  local elapsed=0
  local poll_interval=5
  local any_still_rolling=true

  while [[ "${any_still_rolling}" == "true" ]]; do
    sleep "${poll_interval}"
    elapsed=$(( elapsed + poll_interval ))

    # Check crashes for all non-converged, non-already-crashed components
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      [[ "${_cg_converged[$i]}" == "true" ]] && continue
      [[ "${_cg_crashed[$i]}" == "true" ]]   && continue
      if check_pod_health "${_cg_name[$i]}" "${_cg_container[$i]}" "${_cg_ns[$i]}"; then
        log "  STARTUP CRASH at ${_cg_mid[$i]}Mi — raising floor for ${_cg_name[$i]}/${_cg_container[$i]}"
        _cg_crashed[$i]=true
        _cg_low[$i]="${_cg_mid[$i]}"
        # Kill its rollout watcher
        [[ -n "${rollout_pids[$i]}" ]] && kill "${rollout_pids[$i]}" 2>/dev/null || true
        # Immediately restore last_known_good so the pod recovers in the background
        _cg_recover_component "${i}"
      fi
    done

    # Check if all watchers have finished
    any_still_rolling=false
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      local pid="${rollout_pids[$i]:-}"
      [[ -z "${pid}" ]] && continue
      if kill -0 "${pid}" 2>/dev/null; then
        any_still_rolling=true
        break
      fi
    done
  done

  # Reap all watcher processes
  for i in $(seq 0 $(( _cg_count - 1 ))); do
    [[ -n "${rollout_pids[$i]:-}" ]] && wait "${rollout_pids[$i]}" 2>/dev/null || true
  done

  local any_crashed=false
  for i in $(seq 0 $(( _cg_count - 1 ))); do
    [[ "${_cg_crashed[$i]}" == "true" ]] && any_crashed=true && break
  done

  if [[ "${any_crashed}" == "true" ]]; then
    return 1
  fi

  log "  All rollouts complete. Stabilizing ${STABILIZE_S}s..."
  sleep "${STABILIZE_S}"
  return 0
}

# Backwards-compatible wrapper: apply + wait + stabilize for a single component.
# Used only by code paths that still set one component at a time.
set_memory_limit() {
  local kind="$1" name="$2" container="$3" memory_mi="$4" ns="${5:-${SOLO_NAMESPACE}}"
  apply_memory_limit "${kind}" "${name}" "${container}" "${memory_mi}" "${ns}"

  log "  Waiting for rollout of ${kind}/${name} (monitoring for OOMKilled/CrashLoopBackOff)..."
  kubectl rollout status "${kind}/${name}" -n "${ns}" --timeout=300s >/dev/null 2>&1 &
  local rollout_pid=$!
  local elapsed=0 crashed=false
  while kill -0 "${rollout_pid}" 2>/dev/null; do
    sleep 5; elapsed=$(( elapsed + 5 ))
    if check_pod_health "${name}" "${container}" "${ns}"; then
      log "  Rollout aborted — pod crashed at ${memory_mi}Mi"
      kill "${rollout_pid}" 2>/dev/null || true
      crashed=true; break
    fi
  done
  wait "${rollout_pid}" 2>/dev/null || true
  [[ "${crashed}" == "true" ]] && return 1
  log "  Rollout complete. Stabilizing ${STABILIZE_S}s..."
  sleep "${STABILIZE_S}"
}

# Build the --args string for the NLG test class.
# Common flags used by all test types:
#   -c  number of client threads
#   -a  number of accounts to use
#   -R  reuse existing accounts (skip pre-creation)
#   -t  test duration in seconds
# Extra flags per test type (kept at reasonable defaults):
#   NftTransferLoadTest   -T <nfts-per-account>  -n <nft-class-count>  -S flat  -p <percent-nft>
#   TokenTransferLoadTest -T <tokens-per-account> -A <associations-per-account>
nlg_build_args() {
  local base="-c ${NLG_CLIENTS} -a ${NLG_ACCOUNTS} -R -t ${NLG_DURATION_S}"
  case "${NLG_TEST_CLASS}" in
    NftTransferLoadTest)
      local nfts="${NLG_NFTS:-10}"
      local percent="${NLG_NFT_PERCENT:-50}"
      echo "${base} -T ${nfts} -n ${NLG_ACCOUNTS} -S flat -p ${percent}"
      ;;
    TokenTransferLoadTest)
      local tokens="${NLG_TOKENS:-10}"
      local associations="${NLG_ASSOCIATIONS:-10}"
      echo "${base} -T ${tokens} -A ${associations}"
      ;;
    *)
      # CryptoTransferLoadTest | HCSLoadTest | SmartContractLoadTest
      echo "${base}"
      ;;
  esac
}

# Run the NLG probe in the background; concurrently watch for OOMKills.
# Returns 0 (pass) or 1 (fail / OOM).
run_nlg_probe() {
  local resource_name="$1"
  local container="$2"

  local nlg_args
  nlg_args="$(nlg_build_args)"

  log "  NLG probe: ${NLG_TEST_CLASS} @ ${NLG_TPS} TPS for ${NLG_DURATION_S}s (watching ${resource_name}/${container} for OOM)"
  log "  NLG args: ${nlg_args}"

  local nlg_log
  nlg_log="$(mktemp -t nlg-probe-XXXX.log)"

  npm run solo -- rapid-fire load start \
    --deployment "${SOLO_DEPLOYMENT}" \
    --test "${NLG_TEST_CLASS}" \
    --max-tps "${NLG_TPS}" \
    --java-heap "${NLG_JAVA_HEAP_GB}" \
    --args "\"${nlg_args}\"" \
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

    if check_pod_health "${resource_name}" "${container}"; then
      log "  OOMKilled/crash detected on ${resource_name}/${container}"
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

# Run a JSON-RPC load against the relay HTTP endpoint (port 7546) using concurrent
# curl calls, then watch for OOMKill on the target container.
# Returns 0 (pass) or 1 (fail / OOM / too many RPC errors).
run_relay_rpc_probe() {
  local resource_name="$1"
  local container="$2"

  # Find a running pod for this resource (pod names start with resource_name-)
  local pod_name
  pod_name=$(kubectl get pods -n "${SOLO_NAMESPACE}" --no-headers \
    | awk '{print $1}' | grep "^${resource_name}-" | head -1 || true)

  if [[ -z "${pod_name}" ]]; then
    log "  No pod found for ${resource_name} — cannot run relay-rpc probe"
    return 1
  fi

  # Discover JSON-RPC container port from the pod spec; fall back to 7546.
  # (Service port names vary by chart version: "jsonrpcrelay", "http", etc.)
  local rpc_port
  rpc_port=$(kubectl get pod "${pod_name}" -n "${SOLO_NAMESPACE}" \
    -o jsonpath='{.spec.containers[0].ports[0].containerPort}' 2>/dev/null || echo "")
  rpc_port="${rpc_port:-7546}"

  # Kill any stale port-forwards to this pod from previous iterations — they hold
  # the connection open and cause the new port-forward to conflict or die quickly.
  pkill -f "port-forward.*${pod_name}" 2>/dev/null || true
  sleep 1

  local local_port=$(( (RANDOM % 10000) + 40000 ))

  log "  Relay RPC probe: port-forward ${pod_name}:${rpc_port} → localhost:${local_port} for ${NLG_DURATION_S}s"

  # Capture port-forward stderr to a temp file so we can diagnose unexpected exits
  local pf_log; pf_log=$(mktemp)
  kubectl port-forward -n "${SOLO_NAMESPACE}" "pod/${pod_name}" \
    "${local_port}:${rpc_port}" >"${pf_log}" 2>&1 &
  local pf_pid=$!
  sleep 3  # Let the port-forward establish

  local rpc_payload='{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

  # Verify port-forward is reachable before starting load.
  # Return 2 (infrastructure error) so the caller aborts the binary search entirely
  # rather than incorrectly treating this as an OOM and trying higher memory.
  if ! curl -sf -X POST -H "Content-Type: application/json" \
      --data "${rpc_payload}" --max-time 10 \
      "http://localhost:${local_port}" >/dev/null 2>&1; then
    log "  Cannot reach relay at localhost:${local_port} — port-forward not working, aborting component"
    kill "${pf_pid}" 2>/dev/null || true
    return 2
  fi
  # Snapshot restart count AND last-termination timestamp before load starts.
  # After the port-forward dies we only treat a restart as a NEW crash if both:
  #   (a) restartCount increased, AND
  #   (b) the new lastState.terminated.finishedAt is after probe_start_time.
  # This prevents falsely attributing a restart from a *previous* iteration's OOM
  # to the current (higher) memory setting.
  local probe_start_time; probe_start_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local restart_count_before
  restart_count_before=$(kubectl get pod "${pod_name}" -n "${SOLO_NAMESPACE}" \
    -o jsonpath="{.status.containerStatuses[?(@.name==\"${container}\")].restartCount}" \
    2>/dev/null || echo "0")
  restart_count_before="${restart_count_before:-0}"
  log "  Relay reachable — starting ${NLG_TPS} TPS load for ${NLG_DURATION_S}s (restart count: ${restart_count_before}, probe started: ${probe_start_time})"

  local oom_detected=false
  local load_died=false
  local elapsed=0
  local poll_interval=5

  # Background load loop: use a small pool of persistent worker loops.
  # kubectl port-forward tunnels through the API server — too many concurrent
  # connections kill it. Each worker sends one request then sleeps, keeping
  # total concurrency = RELAY_WORKERS (default 5) at any moment.
  # Sleep per worker = RELAY_WORKERS / NLG_TPS seconds, so aggregate ≈ NLG_TPS RPS.
  local RELAY_WORKERS="${RELAY_WORKERS:-5}"
  # Use awk for float division (bash only does integers)
  local worker_sleep
  worker_sleep=$(awk "BEGIN{printf \"%.3f\", ${RELAY_WORKERS}/${NLG_TPS}}")
  log "  Load workers: ${RELAY_WORKERS} workers × sleep ${worker_sleep}s ≈ ${NLG_TPS} RPS"

  local worker_pids=()
  for w in $(seq 1 "${RELAY_WORKERS}"); do
    (
      while kill -0 "${pf_pid}" 2>/dev/null; do
        curl -sf -X POST \
          -H "Content-Type: application/json" \
          --data "${rpc_payload}" \
          --max-time 5 \
          "http://localhost:${local_port}" >/dev/null 2>&1 || true
        sleep "${worker_sleep}"
      done
    ) &
    worker_pids+=($!)
  done
  # Sentinel: if ALL workers die, load_pid wait will return
  (
    for wpid in "${worker_pids[@]}"; do wait "${wpid}" 2>/dev/null || true; done
  ) &
  local load_pid=$!

  # Poll for OOMKill/crash and also check the load loop is still running.
  # Connectivity health-checks via the same port-forward are unreliable under high
  # concurrent load and produce false failures even when the pod is healthy.
  while [[ ${elapsed} -lt ${NLG_DURATION_S} ]]; do
    sleep "${poll_interval}"
    elapsed=$(( elapsed + poll_interval ))

    if check_pod_health "${resource_name}" "${container}"; then
      log "  OOMKilled/crash detected on ${resource_name}/${container}"
      oom_detected=true
      break
    fi

    # If the port-forward died, all workers will follow. The most likely cause is
    # the pod OOMKilled and restarted — check pod health before deciding.
    if ! kill -0 "${pf_pid}" 2>/dev/null; then
      log "  Port-forward exited early — last output: $(tail -3 "${pf_log}" 2>/dev/null | tr '\n' ' ')"
      load_died=true
      break
    fi
  done

  # Kill all workers, the sentinel, and the port-forward
  for wpid in "${worker_pids[@]}"; do kill "${wpid}" 2>/dev/null || true; done
  kill "${load_pid}" 2>/dev/null || true
  kill "${pf_pid}" 2>/dev/null || true
  wait "${pf_pid}" 2>/dev/null || true
  rm -f "${pf_log}"

  # When the port-forward dies, determine whether the container crashed or it was
  # a genuine infrastructure failure.  Two signals — checked in order:
  #
  # 1. Restart count increased — the container definitely restarted (crashed under
  #    load). This is detectable even while the pod still shows "Running" because
  #    the process exited faster than Kubernetes updates containerStatuses.
  #    "Connection refused" in port-forward output is the typical symptom.
  #
  # 2. OOM state in containerStatuses — poll for up to 60s because Kubernetes can
  #    take 10-30s+ to propagate CrashLoopBackOff / OOMKilled after a restart.
  if [[ "${load_died}" == "true" ]]; then
    local new_restart_count
    if new_restart_count=$(is_new_crash_since "${pod_name}" "${container}" \
        "${restart_count_before}" "${probe_start_time}" "${SOLO_NAMESPACE}"); then
      log "  New restart detected (${restart_count_before} → ${new_restart_count}) during this probe — container crashed under load"
      check_last_termination_oom "${pod_name}" "${container}" "${SOLO_NAMESPACE}" || \
        log "  Last termination: not OOMKilled (process crash) — treating as memory failure"
      oom_detected=true
    else
      local oom_wait=0
      local oom_wait_max=60
      local oom_wait_interval=5
      log "  Port-forward exited, no new restart yet (count=${new_restart_count}) — polling for up to ${oom_wait_max}s"
      while [[ ${oom_wait} -lt ${oom_wait_max} ]]; do
        sleep "${oom_wait_interval}"
        oom_wait=$(( oom_wait + oom_wait_interval ))
        if new_restart_count=$(is_new_crash_since "${pod_name}" "${container}" \
            "${restart_count_before}" "${probe_start_time}" "${SOLO_NAMESPACE}"); then
          log "  New restart detected after ${oom_wait}s (${restart_count_before} → ${new_restart_count}) — container crashed under load"
          check_last_termination_oom "${pod_name}" "${container}" "${SOLO_NAMESPACE}" || \
            log "  Last termination: not OOMKilled (process crash) — treating as memory failure"
          oom_detected=true
          break
        fi
        if check_pod_health "${resource_name}" "${container}"; then
          log "  OOMKilled/crash status confirmed after ${oom_wait}s"
          oom_detected=true
          break
        fi
        log "  No crash signal at ${oom_wait}s (restarts=${new_restart_count}) — waiting..."
      done
      if [[ "${oom_detected}" == "false" ]]; then
        log "  No crash signal after ${oom_wait_max}s — treating as infrastructure error"
      fi
    fi
  fi

  if [[ "${oom_detected}" == "true" ]]; then
    log "  Relay RPC probe FAILED (OOMKilled/crash)"
    return 1
  fi
  if [[ "${load_died}" == "true" ]]; then
    # Load loop died but pod is healthy — true infrastructure failure (e.g. port-forward
    # dropped for unrelated reasons). Abort rather than falsely trying higher memory.
    log "  Relay RPC probe FAILED (load loop died, pod healthy — infrastructure error)"
    return 2
  fi

  log "  Relay RPC probe PASSED (no OOMKill/crash in ${NLG_DURATION_S}s under ${NLG_TPS} TPS load)"
  return 0
}

# Run a read-query load against a mirror service using the documented probe methods.
#
# Probe methods per component (refs: hiero-mirror-node/docs/*/README.md):
#
#   mirror-grpc:
#     grpcurl (if available) → NetworkService/getNodes on pod port 5600
#       grpcurl -plaintext -d '{"file_id":{"fileNum":102},"limit":1}' \
#               <pod>:5600 com.hedera.mirror.api.proto.NetworkService/getNodes
#     Fallback (no grpcurl) → GET /api/v1/network/exchangerate via ingress port 38081
#       (exercises the same REST path that gRPC clients also read from)
#
#   mirror-rest:
#     GET /api/v1/network/exchangerate   — single row from file_data, minimal joins
#     via mirror ingress controller localhost:38081
#
#   mirror-restjava:
#     GET /api/v1/network/supply         — served by restjava, lightweight single row
#     via mirror ingress controller localhost:38081
#
# Strategy:
#   1. For grpc: port-forward pod:5600 and use grpcurl; fall back to REST via ingress.
#   2. For rest/restjava: use the existing solo ingress port-forward (38081).
#   3. Send NLG_TPS concurrent requests per second for QUERY_DURATION_S seconds.
#   4. Poll every 5s for OOMKill/CrashLoopBackOff on the target container.
#   5. Fail if >33% of health-check polls return errors.
#
# Returns 0 (pass) or 1 (fail / OOM / too many errors).
run_query_probe() {
  local resource_name="$1"
  local container="$2"

  local oom_detected=false
  local success_count=0
  local fail_count=0
  local elapsed=0
  local poll_interval=5
  local load_pid=""
  local pf_pid=""

  # ── Determine probe method and set up connectivity ───────────────────────────

  local health_cmd=""   # command string used for the per-poll health check

  if echo "${resource_name}" | grep -q "grpc"; then
    # gRPC probe: port-forward to the grpc pod's HTTP management port (8081).
    # The actuator/health endpoint is the authoritative liveness indicator for the
    # grpc service and exercises its internal state under concurrent polling load.
    local grpc_pod
    grpc_pod=$(kubectl get pods -n "${SOLO_NAMESPACE}" --no-headers \
      | awk '{print $1}' | grep "^${resource_name}-" | head -1 || true)

    if [[ -z "${grpc_pod}" ]]; then
      log "  No pod found for ${resource_name} — cannot run grpc query probe"
      return 1
    fi

    local grpc_local_port=$(( (RANDOM % 10000) + 42000 ))
    log "  gRPC probe: port-forward ${grpc_pod}:8081 → localhost:${grpc_local_port} (actuator/health)"

    kubectl port-forward -n "${SOLO_NAMESPACE}" "pod/${grpc_pod}" \
      "${grpc_local_port}:8081" >/dev/null 2>&1 &
    pf_pid=$!
    sleep 3

    local grpc_health_url="http://localhost:${grpc_local_port}/actuator/health"
    health_cmd="curl -sf --max-time 5 ${grpc_health_url}"

    (
      while kill -0 "${pf_pid}" 2>/dev/null; do
        local i
        for i in $(seq 1 "${NLG_TPS}"); do
          curl -sf --max-time 5 "${grpc_health_url}" >/dev/null 2>&1 &
        done
        wait
        sleep 1
      done
    ) &
    load_pid=$!

  elif echo "${resource_name}" | grep -q "web3"; then
    # mirror-web3: port-forward pod:8545 and hit /actuator/health.
    # The web3 service handles EVM simulation (POST /api/v1/contracts/call) via
    # the ingress, but actuator/health on port 8545 is the authoritative liveness
    # probe and generates real memory pressure under concurrent polling.
    local web3_pod
    web3_pod=$(kubectl get pods -n "${SOLO_NAMESPACE}" --no-headers \
      | awk '{print $1}' | grep "^${resource_name}-" | head -1 || true)

    if [[ -z "${web3_pod}" ]]; then
      log "  No pod found for ${resource_name} — cannot run web3 query probe"
      return 1
    fi

    local web3_local_port=$(( (RANDOM % 10000) + 43000 ))
    log "  web3 probe: port-forward ${web3_pod}:8545 → localhost:${web3_local_port} (actuator/health)"

    kubectl port-forward -n "${SOLO_NAMESPACE}" "pod/${web3_pod}" \
      "${web3_local_port}:8545" >/dev/null 2>&1 &
    pf_pid=$!
    sleep 3

    local web3_health_url="http://localhost:${web3_local_port}/actuator/health"
    health_cmd="curl -sf --max-time 5 ${web3_health_url}"

    (
      while kill -0 "${pf_pid}" 2>/dev/null; do
        local i
        for i in $(seq 1 "${NLG_TPS}"); do
          curl -sf --max-time 5 "${web3_health_url}" >/dev/null 2>&1 &
        done
        wait
        sleep 1
      done
    ) &
    load_pid=$!

  elif echo "${resource_name}" | grep -q "restjava"; then
    # mirror-restjava: GET /api/v1/network/supply (served exclusively by restjava)
    local restjava_url="http://localhost:${MIRROR_INGRESS_LOCAL_PORT}/api/v1/network/supply"
    log "  REST probe: ${restjava_url}"
    health_cmd="curl -sf --max-time 5 ${restjava_url}"
    (
      while true; do
        local i
        for i in $(seq 1 "${NLG_TPS}"); do
          curl -sf --max-time 5 "${restjava_url}" >/dev/null 2>&1 &
        done
        wait
        sleep 1
      done
    ) &
    load_pid=$!

  else
    # mirror-rest: GET /api/v1/network/exchangerate (single row, minimal joins)
    local rest_url="http://localhost:${MIRROR_INGRESS_LOCAL_PORT}/api/v1/network/exchangerate"
    log "  REST probe: ${rest_url}"
    health_cmd="curl -sf --max-time 5 ${rest_url}"
    (
      while true; do
        local i
        for i in $(seq 1 "${NLG_TPS}"); do
          curl -sf --max-time 5 "${rest_url}" >/dev/null 2>&1 &
        done
        wait
        sleep 1
      done
    ) &
    load_pid=$!
  fi

  log "  Running for ${QUERY_DURATION_S}s @ ${NLG_TPS} RPS, watching ${resource_name}/${container} for OOM"

  # ── Monitor loop ─────────────────────────────────────────────────────────────

  while [[ ${elapsed} -lt ${QUERY_DURATION_S} ]]; do
    sleep "${poll_interval}"
    elapsed=$(( elapsed + poll_interval ))

    if check_pod_health "${resource_name}" "${container}"; then
      log "  OOMKilled/CrashLoopBackOff detected on ${resource_name}/${container}"
      oom_detected=true
      break
    fi

    # Health-check poll using the same method as the load
    if eval "${health_cmd}" >/dev/null 2>&1; then
      success_count=$(( success_count + 1 ))
    else
      fail_count=$(( fail_count + 1 ))
    fi
  done

  # ── Cleanup ──────────────────────────────────────────────────────────────────

  [[ -n "${load_pid}" ]] && kill "${load_pid}" 2>/dev/null || true
  [[ -n "${pf_pid}" ]]   && kill "${pf_pid}"   2>/dev/null || true
  wait "${load_pid}" "${pf_pid}" 2>/dev/null || true

  local total=$(( success_count + fail_count ))
  if [[ "${oom_detected}" == "true" ]]; then
    log "  Query probe FAILED (OOMKilled/CrashLoopBackOff)"
    return 1
  fi
  if [[ ${total} -gt 0 && ${fail_count} -gt $(( total / 3 )) ]]; then
    log "  Query probe FAILED (${fail_count}/${total} health checks failed)"
    return 1
  fi

  log "  Query probe PASSED (${success_count}/${total} health checks ok)"
  return 0
}

# Dispatcher: run the appropriate probe(s) based on probe_type.
#   nlg       → NLG CryptoTransfer load (consensus write path)
#   relay-rpc → curl eth_blockNumber loop (relay JSON-RPC path)
#   query     → concurrent HTTP GET / grpcurl reads (mirror read path)
#   both      → NLG first, then relay-rpc; both must pass
#   none      → skip load; always return pass (limit applied for observation)
run_probe() {
  local probe_type="$1"
  local resource_name="$2"
  local container="$3"
  local rc

  case "${probe_type}" in
    nlg)
      run_nlg_probe "${resource_name}" "${container}"
      ;;
    relay-rpc)
      run_relay_rpc_probe "${resource_name}" "${container}"
      ;;
    query)
      run_query_probe "${resource_name}" "${container}"
      ;;
    both)
      log "  probe=both: running NLG then relay-rpc (both must pass)"
      run_nlg_probe "${resource_name}" "${container}"
      rc=$?
      [[ ${rc} -ne 0 ]] && return "${rc}"
      run_relay_rpc_probe "${resource_name}" "${container}"
      ;;
    none)
      log "  probe=none: skipping load test (memory limit applied for observation)"
      return 0
      ;;
    *)
      log "  Unknown probe_type '${probe_type}' — defaulting to nlg"
      run_nlg_probe "${resource_name}" "${container}"
      ;;
  esac
}

# Binary-search minimum viable memory for one (workload, container) pair.
# $4 = registry max_mi (used only as fallback when live limit is unavailable)
# $5 = probe_type (defaults to nlg)
#
# Search bounds are derived from the pod's CURRENT live memory limit:
#   high = current live limit  (we know the pod works here)
#   low  = 20% of current live limit  (aggressive floor; OOM below this is expected)
# Falls back to [MEMORY_MIN_MI, registry max_mi] if live limit cannot be read.
optimize_one() {
  local kind="$1"
  local name="$2"
  local container="$3"
  local registry_max_mi="${4:-${MEMORY_MAX_MI}}"
  local probe_type="${5:-nlg}"
  local ns="${6:-${SOLO_NAMESPACE}}"

  # Discover live memory limit and derive search bounds
  local live_limit_mi
  live_limit_mi=$(get_current_memory_limit_mi "${kind}" "${name}" "${container}" "${ns}")

  # High bound = registry max_mi * 110% — a fixed ceiling derived from the known
  # safe maximum, independent of whatever live limit happens to be set right now.
  local high=$(( registry_max_mi * 11 / 10 ))
  local low="${MEMORY_GRANULARITY_MI}"
  if [[ -n "${live_limit_mi}" && "${live_limit_mi}" -gt 0 ]]; then
    log "Live memory limit: ${live_limit_mi}Mi  registry max: ${registry_max_mi}Mi → high=110%=${high}Mi  search range [${low}–${high}Mi]"
  else
    log "Could not read live memory limit for ${kind}/${name} [${container}] — using registry max: ${registry_max_mi}Mi → high=110%=${high}Mi  search range [${low}–${high}Mi]"
  fi

  # If the range is already ≤ granularity (e.g. 20% window is narrow), scale down
  # the effective granularity to half the range so at least one iteration runs.
  local effective_granularity="${MEMORY_GRANULARITY_MI}"
  if [[ $(( high - low )) -le ${effective_granularity} ]]; then
    effective_granularity=$(( (high - low) / 2 ))
    [[ ${effective_granularity} -lt 1 ]] && effective_granularity=1
    log "Range [${low}–${high}]Mi < granularity ${MEMORY_GRANULARITY_MI}Mi — using effective granularity ${effective_granularity}Mi"
  fi

  local prev_display="${live_limit_mi:+${live_limit_mi}Mi}"
  prev_display="${prev_display:-unknown}"

  header "Optimizing ${kind}/${name}  container: ${container}  probe: ${probe_type}  [${low}–${high}Mi]"
  local best_mi=0
  local iteration=0

  while [[ $(( high - low )) -gt ${effective_granularity} ]]; do
    iteration=$(( iteration + 1 ))
    local mid=$(( (low + high) / 2 ))
    log "Iter ${iteration}: testing ${mid}Mi  [range ${low}–${high}]"

    if ! set_memory_limit "${kind}" "${name}" "${container}" "${mid}" "${ns}"; then
      log "FAILURE at ${mid}Mi — pod crashed during startup (OOMKilled/CrashLoopBackOff)"
      low="${mid}"
      continue
    fi

    local probe_rc
    run_probe "${probe_type}" "${name}" "${container}" && probe_rc=0 || probe_rc=$?

    if [[ ${probe_rc} -eq 2 ]]; then
      # Infrastructure error (port-forward failure, load loop died, etc.) — not OOM.
      # Retrying at higher memory won't help; abort this component entirely.
      log "ABORT ${name}/${container}: probe infrastructure error — skipping component"
      printf "%-14s  %-40s  %-20s  %-18s  %s\n" \
        "PROBE_ERROR" "${kind}/${name}" "${container}" "${prev_display}" "(aborted)" \
        >> "${RESULTS_FILE}"
      return 1
    elif [[ ${probe_rc} -eq 0 ]]; then
      log "SUCCESS at ${mid}Mi — trying lower"
      best_mi="${mid}"
      high="${mid}"
    else
      log "FAILURE at ${mid}Mi — trying higher"
      low="${mid}"
    fi
  done

  if [[ "${best_mi}" -gt 0 ]]; then
    log "Converged: optimal = ${best_mi}Mi for ${kind}/${name} [${container}]  (was ${prev_display})"
    set_memory_limit "${kind}" "${name}" "${container}" "${best_mi}" "${ns}"
    printf "%-14s  %-40s  %-20s  %-18s  %s\n" \
      "OK" "${kind}/${name}" "${container}" "${prev_display}" "${best_mi}Mi" \
      >> "${RESULTS_FILE}"
  else
    log "WARNING: no passing value found in [${low},${high}]Mi for ${kind}/${name} [${container}]  (was ${prev_display})"
    printf "%-14s  %-40s  %-20s  %-18s  %s\n" \
      "NOT FOUND" "${kind}/${name}" "${container}" "${prev_display}" ">(${high}Mi)" \
      >> "${RESULTS_FILE}"
  fi
}

# Resolve alias → discover live resource(s) → optimize each (container pair)
optimize_alias() {
  local alias="$1"
  local kind; kind="$(registry_field "${alias}" 2)"
  local pattern; pattern="$(registry_field "${alias}" 3)"
  local containers_csv; containers_csv="$(registry_field "${alias}" 4)"
  local component_max_mi; component_max_mi="$(registry_field "${alias}" 5)"
  local probe_type; probe_type="$(registry_field "${alias}" 6)"
  probe_type="${probe_type:-nlg}"
  # Field 7: optional namespace override (empty = use SOLO_NAMESPACE)
  local ns_override; ns_override="$(registry_field "${alias}" 7)"
  local ns="${ns_override:-${SOLO_NAMESPACE}}"
  # Use component-specific max if defined, otherwise fall back to global --max-memory
  local effective_max_mi="${component_max_mi:-${MEMORY_MAX_MI}}"

  if [[ -z "${kind}" ]]; then
    log "Unknown component alias '${alias}' — use --list to see valid aliases"
    return 1
  fi

  log "Component ${alias}: max=${effective_max_mi}Mi probe=${probe_type} namespace=${ns}"

  resource_names=()
  while IFS= read -r line; do
    [[ -n "${line}" ]] && resource_names+=("${line}")
  done < <(discover_resources "${kind}" "${pattern}" "${ns}")

  if [[ ${#resource_names[@]} -eq 0 ]]; then
    log "No live ${kind} matching '${pattern}' in namespace ${ns} — skipping ${alias}"
    printf "%-14s  %-40s  %-20s  %-18s  %s\n" "SKIPPED" "${kind}/${pattern}" "(not found)" "-" "" \
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
      discovered="$(auto_discover_container "${kind}" "${name}" "${ns}")"
      if [[ -z "${discovered}" ]]; then
        log "Cannot determine container for ${kind}/${name} — skipping"
        continue
      fi
      containers_to_test=("${discovered}")
    fi

    local container
    for container in "${containers_to_test[@]}"; do
      optimize_one "${kind}" "${name}" "${container}" "${effective_max_mi}" "${probe_type}" "${ns}"
    done
  done
}

# Parallel binary search across all components sharing the same probe_type.
# Each component gets its own [low, high, best] state updated per round.
# One shared probe run per round — if a component crashes, raise its memory;
# if it survives, lower it. All non-converged components move each round.
#
# Global arrays (prefixed _cg_) are used because bash cannot pass arrays to functions.
_cg_count=0
_cg_alias=(); _cg_kind=(); _cg_name=(); _cg_container=(); _cg_ns=()
_cg_low=(); _cg_high=(); _cg_mid=(); _cg_best=(); _cg_prev=()
_cg_registry_max=(); _cg_last_known_good=(); _cg_last_known_min=(); _cg_converged=()
_cg_restart_before=(); _cg_probe_start=()
_cg_nlg_haproxy_ip=""   # last haproxy pod IP used when NLG chart was deployed

# Populate _cg_* arrays with all live (kind, name, container) tuples for a list of aliases.
cg_discover_components() {
  _cg_count=0
  _cg_alias=(); _cg_kind=(); _cg_name=(); _cg_container=(); _cg_ns=()
  _cg_low=(); _cg_high=(); _cg_mid=(); _cg_best=(); _cg_prev=()
  _cg_registry_max=(); _cg_last_known_good=(); _cg_last_known_min=(); _cg_converged=()

  local alias
  for alias in "$@"; do
    local kind; kind="$(registry_field "${alias}" 2)"
    local pattern; pattern="$(registry_field "${alias}" 3)"
    local containers_csv; containers_csv="$(registry_field "${alias}" 4)"
    local registry_max; registry_max="$(registry_field "${alias}" 5)"
    local last_known_good; last_known_good="$(registry_field "${alias}" 7)"
    local last_known_min; last_known_min="$(registry_field "${alias}" 8)"
    local ns_override; ns_override="$(registry_field "${alias}" 9)"
    local ns="${ns_override:-${SOLO_NAMESPACE}}"
    registry_max="${registry_max:-${MEMORY_MAX_MI}}"

    [[ -z "${kind}" ]] && continue

    local names=()
    while IFS= read -r line; do
      [[ -n "${line}" ]] && names+=("${line}")
    done < <(discover_resources "${kind}" "${pattern}" "${ns}")

    local name
    for name in "${names[@]}"; do
      local containers=()
      if [[ -n "${containers_csv}" ]]; then
        IFS=',' read -ra containers <<< "${containers_csv}"
      else
        local discovered; discovered="$(auto_discover_container "${kind}" "${name}" "${ns}")"
        [[ -z "${discovered}" ]] && continue
        containers=("${discovered}")
      fi

      local container
      for container in "${containers[@]}"; do
        local live_mi; live_mi="$(get_current_memory_limit_mi "${kind}" "${name}" "${container}" "${ns}")"
        # Use last_known_good as the initial ceiling if set; otherwise fall back to max_memory_mi.
        local high
        if [[ -n "${last_known_good}" && "${last_known_good}" -gt 0 ]]; then
          high="${last_known_good}"
        else
          high="${registry_max}"
        fi
        local low
        if [[ -n "${last_known_min}" && "${last_known_min}" -gt 0 ]]; then
          low="${last_known_min}"
        else
          low="${MEMORY_GRANULARITY_MI}"
        fi
        local prev_display="${live_mi:+${live_mi}Mi}"; prev_display="${prev_display:-unknown}"

        _cg_alias+=("${alias}")
        _cg_kind+=("${kind}")
        _cg_name+=("${name}")
        _cg_container+=("${container}")
        _cg_ns+=("${ns}")
        _cg_low+=("${low}")
        _cg_high+=("${high}")
        _cg_mid+=(0)
        _cg_best+=(0)
        _cg_prev+=("${prev_display}")
        _cg_registry_max+=("${registry_max}")
        _cg_last_known_good+=("${last_known_good:-${registry_max}}")
        _cg_last_known_min+=("${last_known_min:-${MEMORY_GRANULARITY_MI}}")
        _cg_converged+=(false)
        _cg_count=$(( _cg_count + 1 ))
        log "  Registered ${alias} → ${kind}/${name} [${container}]  ns=${ns}  range=[${low}–${high}Mi]  prev=${prev_display}"
      done
    done
  done
}

# Snapshot each component's restart count and record probe start time.
cg_snapshot_restarts() {
  local probe_start; probe_start=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  _cg_restart_before=()
  _cg_probe_start=()
  local i
  for i in $(seq 0 $(( _cg_count - 1 ))); do
    local rc
    rc=$(kubectl get pods -n "${_cg_ns[$i]}" --no-headers -o name 2>/dev/null \
      | sed 's|pod/||' | grep "^${_cg_name[$i]}-" | head -1 \
      | xargs -I{} kubectl get pod {} -n "${_cg_ns[$i]}" \
          -o jsonpath="{.status.containerStatuses[?(@.name==\"${_cg_container[$i]}\")].restartCount}" \
          2>/dev/null || echo "0")
    _cg_restart_before+=("${rc:-0}")
    _cg_probe_start+=("${probe_start}")
  done
}

# Apply last_known_good (or registry_max as fallback) to a crashed component so it
# recovers while the probe continues monitoring other components.
# Does NOT wait for rollout — fires the patch and returns immediately.
_cg_recover_component() {
  local i="$1"
  local recover_mi="${_cg_last_known_good[$i]:-${_cg_registry_max[$i]}}"
  log "  RECOVERY: applying ${recover_mi}Mi to ${_cg_name[$i]}/${_cg_container[$i]} so pod restarts healthy"
  apply_memory_limit "${_cg_kind[$i]}" "${_cg_name[$i]}" "${_cg_container[$i]}" \
    "${recover_mi}" "${_cg_ns[$i]}"
}

# For NLG probe: if the haproxy pod IP has changed since the NLG chart was last
# deployed, destroy the chart so the next rapid-fire load start redeploys it with
# fresh IPs.  Haproxy gets a new pod IP on every restart (memory limit change),
# which would cause gRPC timeouts in the NLG.
_maybe_refresh_nlg_chart() {
  local current_ip
  current_ip=$(kubectl get pod -n "${SOLO_NAMESPACE}" -l "solo.hedera.com/type=haproxy" \
    --no-headers -o custom-columns=IP:.status.podIP 2>/dev/null | head -1 || true)
  if [[ -z "${current_ip}" ]]; then
    log "  NLG: cannot get haproxy pod IP — skipping chart refresh"
    return
  fi
  if [[ "${current_ip}" == "${_cg_nlg_haproxy_ip}" ]]; then
    log "  NLG: haproxy IP unchanged (${current_ip}) — NLG chart still valid"
    return
  fi
  # Check the account-id label on the haproxy pod for the Hedera node account.
  local haproxy_account
  haproxy_account=$(kubectl get pod -n "${SOLO_NAMESPACE}" -l "solo.hedera.com/type=haproxy" \
    --no-headers -o custom-columns=ACCT:.metadata.labels."solo\.hedera\.com/account-id" \
    2>/dev/null | head -1 || true)
  haproxy_account="${haproxy_account:-0.0.3}"

  log "  NLG: haproxy IP changed (${_cg_nlg_haproxy_ip:-none} → ${current_ip}) — upgrading NLG chart in-place"
  # Use helm upgrade --reuse-values to update just the haproxy IP.
  # Avoids destroy+reinstall which triggers "Install libraries" and pod-name race conditions.
  helm upgrade network-load-generator \
    -n "${SOLO_NAMESPACE}" \
    --reuse-values \
    --set "loadGenerator.properties[0]=${current_ip}\\:50211=${haproxy_account}" \
    2>/dev/null || {
      log "  NLG: helm upgrade failed — NLG chart may not be installed yet; skipping"
      _cg_nlg_haproxy_ip="${current_ip}"
      return
    }
  # Wait for the rolling update to complete.
  log "  NLG: waiting for NLG deployment rollout..."
  kubectl rollout status deployment/network-load-generator \
    -n "${SOLO_NAMESPACE}" --timeout=120s >/dev/null 2>&1 || true
  _cg_nlg_haproxy_ip="${current_ip}"
  log "  NLG: chart updated with haproxy IP ${current_ip} (account ${haproxy_account})"
}

# Check each non-converged component for a new crash during this probe round.
# _cg_crashed[i] is STICKY — once true it stays true for the rest of the round.
# Components already marked crashed are skipped to avoid log spam.
cg_check_crashes() {
  local i
  for i in $(seq 0 $(( _cg_count - 1 ))); do
    [[ "${_cg_converged[$i]}" == "true" ]] && continue
    # Already crashed this round — do not re-check or re-log
    [[ "${_cg_crashed[$i]}" == "true" ]] && continue

    # Find current pod name
    local pod_name
    pod_name=$(kubectl get pods -n "${_cg_ns[$i]}" --no-headers -o name 2>/dev/null \
      | sed 's|pod/||' | grep "^${_cg_name[$i]}-" | head -1 || true)
    [[ -z "${pod_name}" ]] && continue

    # Check pod health (current state)
    if check_pod_health "${_cg_name[$i]}" "${_cg_container[$i]}" "${_cg_ns[$i]}"; then
      log "  CRASH detected: ${_cg_kind[$i]}/${_cg_name[$i]} [${_cg_container[$i]}] — OOMKilled/CrashLoopBackOff"
      _cg_crashed[$i]=true
      _cg_recover_component "${i}"
      continue
    fi

    # Check restart count + timestamp (catches fast crashes before status updates)
    local rc_now
    rc_now=$(kubectl get pod "${pod_name}" -n "${_cg_ns[$i]}" \
      -o jsonpath="{.status.containerStatuses[?(@.name==\"${_cg_container[$i]}\")].restartCount}" \
      2>/dev/null || echo "0")
    rc_now="${rc_now:-0}"
    if [[ "${rc_now}" -gt "${_cg_restart_before[$i]}" ]]; then
      local finished_at
      finished_at=$(kubectl get pod "${pod_name}" -n "${_cg_ns[$i]}" \
        -o jsonpath="{.status.containerStatuses[?(@.name==\"${_cg_container[$i]}\")].lastState.terminated.finishedAt}" \
        2>/dev/null || echo "")
      if [[ -z "${finished_at}" || "${finished_at}" > "${_cg_probe_start[$i]}" ]]; then
        log "  CRASH detected: ${_cg_kind[$i]}/${_cg_name[$i]} [${_cg_container[$i]}] — restart count ${_cg_restart_before[$i]}→${rc_now} during probe"
        _cg_crashed[$i]=true
        _cg_recover_component "${i}"
      else
        log "  Restart count ${_cg_restart_before[$i]}→${rc_now} for ${_cg_name[$i]} but finishedAt=${finished_at} predates probe — ignoring stale restart"
      fi
    fi
  done
}

# Start shared background traffic for a probe_type category.
# For nlg and relay-rpc, one shared traffic stream covers all components.
# For query, each component gets its own workers targeting its specific endpoint —
# different mirror services handle different API paths through the same ingress
# (grpc→pod:8081/actuator/health, web3→pod:8545/actuator/health,
#  restjava→ingress/api/v1/network/supply, rest→ingress/api/v1/network/exchangerate).
#
# Sets globals: _cg_traffic_pids, _cg_traffic_pf_pid, _cg_traffic_log
# Also: _cg_comp_pf_pids (per-component port-forward pids for query probes)
_cg_traffic_pids=()
_cg_traffic_pf_pid=""
_cg_traffic_log=""
_cg_comp_pf_pids=()   # indexed by _cg_count position, for query per-component pf cleanup
_cg_relay_pod_name=""
_cg_relay_local_port=""
_cg_relay_rpc_port=""
_cg_relay_worker_count=0
_cg_relay_worker_sleep="0"

# Start (or restart) relay-rpc POST workers targeting localhost:${_cg_relay_local_port}.
# Kills any existing worker pids in _cg_traffic_pids before launching fresh ones.
# Workers send eth_getBlockByNumber(latest,true) to exercise the relay's memory footprint.
_start_relay_workers() {
  # Kill any previously running workers
  local pid
  for pid in "${_cg_traffic_pids[@]}"; do kill "${pid}" 2>/dev/null || true; done
  _cg_traffic_pids=()
  local work_payload='{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["latest",true],"id":1}'
  local url="http://localhost:${_cg_relay_local_port}"
  local w
  for w in $(seq 1 "${_cg_relay_worker_count}"); do
    (
      while true; do
        curl -s -X POST -H "Content-Type: application/json" \
          --data "${work_payload}" --max-time 5 "${url}" >/dev/null 2>&1 || true
        sleep "${_cg_relay_worker_sleep}"
      done
    ) &
    local worker_pid=$!
    disown "${worker_pid}"   # suppress bash "Terminated" job-control messages on kill
    _cg_traffic_pids+=("${worker_pid}")
  done
  log "  relay-rpc: ${_cg_relay_worker_count} POST workers started (pids: ${_cg_traffic_pids[*]}) → localhost:${_cg_relay_local_port}"
}

# Kill ALL kubectl port-forward processes targeting relay pods, plus the tracked pid.
# Call this before a pod restart so no stale tunnels linger across pod lifecycle.
_kill_relay_portforwards() {
  pkill -f "kubectl.*port-forward.*relay" 2>/dev/null || true
  [[ -n "${_cg_traffic_pf_pid}" ]] && kill "${_cg_traffic_pf_pid}" 2>/dev/null || true
  _cg_traffic_pf_pid=""
  _cg_relay_local_port=""
  log "  relay-rpc: killed existing port-forward processes"
}

# After a pod rollout, establish a fresh port-forward to the Running relay pod.
# Sets _cg_relay_pod_name, _cg_relay_rpc_port, _cg_relay_local_port, _cg_traffic_pf_pid.
# Returns 1 if no Running pod is found or port-forward is not reachable.
_setup_relay_portforward() {
  local new_pod
  new_pod=$(kubectl get pods -n "${SOLO_NAMESPACE}" --no-headers \
    | awk '$3=="Running"{print $1}' | grep "^relay-[0-9]" | grep -v "\-ws-" | head -1 || true)
  if [[ -z "${new_pod}" ]]; then
    log "  relay-rpc: no Running relay pod found — cannot set up port-forward"
    return 1
  fi
  _cg_relay_pod_name="${new_pod}"
  _cg_relay_rpc_port=$(kubectl get pod "${_cg_relay_pod_name}" -n "${SOLO_NAMESPACE}" \
    -o jsonpath='{.spec.containers[0].ports[0].containerPort}' 2>/dev/null || echo "7546")
  _cg_relay_local_port=$(( (RANDOM % 10000) + 40000 ))
  # Use the fixed NLG_TRAFFIC_LOG path (same as start_category_traffic uses).
  _cg_traffic_log="${NLG_TRAFFIC_LOG}"
  : > "${_cg_traffic_log}"
  log "  relay-rpc: port-forwarding pod/${_cg_relay_pod_name}:${_cg_relay_rpc_port} → localhost:${_cg_relay_local_port}"
  kubectl port-forward -n "${SOLO_NAMESPACE}" "pod/${_cg_relay_pod_name}" \
    "${_cg_relay_local_port}:${_cg_relay_rpc_port}" >"${_cg_traffic_log}" 2>&1 &
  _cg_traffic_pf_pid=$!
  sleep 3
  local check_payload='{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
  local test_resp
  test_resp=$(curl -s -X POST -H "Content-Type: application/json" \
    --data "${check_payload}" --max-time 10 "http://localhost:${_cg_relay_local_port}" 2>/dev/null || true)
  if [[ -z "${test_resp}" ]]; then
    log "  relay-rpc: port-forward not reachable on localhost:${_cg_relay_local_port} — aborting"
    kill "${_cg_traffic_pf_pid}" 2>/dev/null || true
    _cg_traffic_pf_pid=""
    _cg_relay_local_port=""
    return 1
  fi
  log "  relay-rpc: port-forward ready localhost:${_cg_relay_local_port} → pod/${_cg_relay_pod_name}:${_cg_relay_rpc_port} — ${test_resp}"
}

# Start workers for a single query component (by _cg index i).
# Appends worker pids to _cg_traffic_pids and pf pid to _cg_comp_pf_pids[i].
_start_query_component_traffic() {
  local i="$1"
  local resource_name="${_cg_name[$i]}"
  local ns="${_cg_ns[$i]}"
  local QUERY_WORKERS="${QUERY_WORKERS:-5}"
  local worker_sleep; worker_sleep=$(awk "BEGIN{printf \"%.3f\", ${QUERY_WORKERS}/${NLG_TPS}}")
  _cg_comp_pf_pids[$i]=""

  if echo "${resource_name}" | grep -q "grpc"; then
    # mirror-grpc: port-forward pod:8081, hit /actuator/health
    local pod_name; pod_name=$(kubectl get pods -n "${ns}" --no-headers \
      | awk '{print $1}' | grep "^${resource_name}-" | head -1 || true)
    if [[ -z "${pod_name}" ]]; then
      log "  [${resource_name}] No pod found — skipping query traffic"
      return
    fi
    local local_port=$(( (RANDOM % 10000) + 42000 ))
    kubectl port-forward -n "${ns}" "pod/${pod_name}" \
      "${local_port}:8081" >/dev/null 2>&1 &
    _cg_comp_pf_pids[$i]=$!
    sleep 2
    local url="http://localhost:${local_port}/actuator/health"
    log "  [${resource_name}] grpc traffic: ${QUERY_WORKERS} workers → ${url}"
    local pf_ref="${_cg_comp_pf_pids[$i]}"
    for w in $(seq 1 "${QUERY_WORKERS}"); do
      ( while kill -0 "${pf_ref}" 2>/dev/null; do
          curl -sf --max-time 5 "${url}" >/dev/null 2>&1 || true
          sleep "${worker_sleep}"
        done ) &
      _cg_traffic_pids+=($!)
    done

  elif echo "${resource_name}" | grep -q "web3"; then
    # mirror-web3: port-forward pod:8545, hit /actuator/health
    local pod_name; pod_name=$(kubectl get pods -n "${ns}" --no-headers \
      | awk '{print $1}' | grep "^${resource_name}-" | head -1 || true)
    if [[ -z "${pod_name}" ]]; then
      log "  [${resource_name}] No pod found — skipping query traffic"
      return
    fi
    local local_port=$(( (RANDOM % 10000) + 43000 ))
    kubectl port-forward -n "${ns}" "pod/${pod_name}" \
      "${local_port}:8545" >/dev/null 2>&1 &
    _cg_comp_pf_pids[$i]=$!
    sleep 2
    local url="http://localhost:${local_port}/actuator/health"
    log "  [${resource_name}] web3 traffic: ${QUERY_WORKERS} workers → ${url}"
    local pf_ref="${_cg_comp_pf_pids[$i]}"
    for w in $(seq 1 "${QUERY_WORKERS}"); do
      ( while kill -0 "${pf_ref}" 2>/dev/null; do
          curl -sf --max-time 5 "${url}" >/dev/null 2>&1 || true
          sleep "${worker_sleep}"
        done ) &
      _cg_traffic_pids+=($!)
    done

  elif echo "${resource_name}" | grep -q "restjava"; then
    # mirror-restjava: GET /api/v1/network/supply via ingress (restjava-only path)
    local url="http://localhost:${MIRROR_INGRESS_LOCAL_PORT}/api/v1/network/supply"
    log "  [${resource_name}] restjava traffic: ${QUERY_WORKERS} workers → ${url}"
    for w in $(seq 1 "${QUERY_WORKERS}"); do
      ( while true; do
          curl -sf --max-time 5 "${url}" >/dev/null 2>&1 || true
          sleep "${worker_sleep}"
        done ) &
      _cg_traffic_pids+=($!)
    done

  else
    # mirror-rest, mirror-ingress-controller, or anything else:
    # GET /api/v1/network/exchangerate via ingress (served by mirror-rest)
    local url="http://localhost:${MIRROR_INGRESS_LOCAL_PORT}/api/v1/network/exchangerate"
    log "  [${resource_name}] rest/ingress traffic: ${QUERY_WORKERS} workers → ${url}"
    for w in $(seq 1 "${QUERY_WORKERS}"); do
      ( while true; do
          curl -sf --max-time 5 "${url}" >/dev/null 2>&1 || true
          sleep "${worker_sleep}"
        done ) &
      _cg_traffic_pids+=($!)
    done
  fi
}

start_category_traffic() {
  local probe_type="$1"
  _cg_traffic_pids=()
  _cg_traffic_pf_pid=""
  # Always use the fixed NLG_TRAFFIC_LOG path; truncate at start of each round
  # so `tail -f /tmp/nlg-traffic.log` always shows the current probe.
  _cg_traffic_log="${NLG_TRAFFIC_LOG}"
  : > "${_cg_traffic_log}"
  _cg_comp_pf_pids=()

  case "${probe_type}" in
    nlg)
      local nlg_args="-c ${NLG_CLIENTS} -a ${NLG_ACCOUNTS} -t ${NLG_DURATION_S}"
      npm run solo -- rapid-fire load start \
        --deployment "${SOLO_DEPLOYMENT}" \
        --test "${NLG_TEST_CLASS}" \
        --max-tps "${NLG_TPS}" \
        --java-heap "${NLG_JAVA_HEAP_GB}" \
        --args "\"${nlg_args}\"" \
        --quiet-mode \
        >"${_cg_traffic_log}" 2>&1 &
      _cg_traffic_pids=($!)
      log "  Category traffic: NLG started (pid=${_cg_traffic_pids[*]}) — log: ${_cg_traffic_log}"
      ;;

    relay-rpc)
      # Port-forward is already established by _setup_relay_portforward() before this call.
      if [[ -z "${_cg_relay_local_port}" ]]; then
        log "  relay-rpc: no port-forward established — cannot start workers"
        return 1
      fi
      _cg_relay_worker_count="${RELAY_WORKERS:-5}"
      _cg_relay_worker_sleep="$(awk "BEGIN{printf \"%.3f\", ${_cg_relay_worker_count}/${NLG_TPS}}")"
      log "  Category traffic: relay-rpc ${_cg_relay_worker_count} workers × sleep ${_cg_relay_worker_sleep}s ≈ ${NLG_TPS} RPS → localhost:${_cg_relay_local_port} (eth_getBlockByNumber)"
      _start_relay_workers
      ;;

    query)
      # Each component gets its own workers targeting its specific endpoint.
      # All run simultaneously so we probe all query components in one round.
      local i
      for i in $(seq 0 $(( _cg_count - 1 ))); do
        [[ "${_cg_converged[$i]}" == "true" ]] && continue
        _start_query_component_traffic "${i}"
      done
      ;;

    both)
      start_category_traffic "nlg"
      ;;

    none)
      log "  Category traffic: probe=none, no traffic"
      ;;
  esac
}

stop_category_traffic() {
  for pid in "${_cg_traffic_pids[@]}"; do kill "${pid}" 2>/dev/null || true; done
  [[ -n "${_cg_traffic_pf_pid}" ]] && kill "${_cg_traffic_pf_pid}" 2>/dev/null || true
  for pf_pid in "${_cg_comp_pf_pids[@]}"; do
    [[ -n "${pf_pid}" ]] && kill "${pf_pid}" 2>/dev/null || true
  done
  _cg_traffic_pids=()
  _cg_traffic_pf_pid=""
  _cg_comp_pf_pids=()
  _cg_relay_pod_name=""
  _cg_relay_local_port=""
  _cg_relay_rpc_port=""
  _cg_relay_worker_count=0
  _cg_relay_worker_sleep="0"
}

# Run parallel binary search for all components in a probe_type group.
optimize_category_group() {
  local probe_type="$1"
  shift
  local aliases=("$@")

  header "Category: probe_type=${probe_type}  aliases=${aliases[*]}"

  cg_discover_components "${aliases[@]}"

  if [[ ${_cg_count} -eq 0 ]]; then
    log "No live components found for category ${probe_type} — skipping"
    return 0
  fi

  # Handle probe=none: apply registry max (no probing needed)
  if [[ "${probe_type}" == "none" ]]; then
    local i
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      log "probe=none: applying max limit ${_cg_registry_max[$i]}Mi to ${_cg_kind[$i]}/${_cg_name[$i]} [${_cg_container[$i]}]"
      set_memory_limit "${_cg_kind[$i]}" "${_cg_name[$i]}" "${_cg_container[$i]}" \
        "${_cg_registry_max[$i]}" "${_cg_ns[$i]}"
      printf "%-14s  %-40s  %-20s  %-18s  %s\n" \
        "OBSERVED" "${_cg_kind[$i]}/${_cg_name[$i]}" "${_cg_container[$i]}" \
        "${_cg_prev[$i]}" "${_cg_registry_max[$i]}Mi" >> "${RESULTS_FILE}"
    done
    return 0
  fi

  # Pre-flight: if a component's live limit differs from last_known_good, apply all changes
  # simultaneously, then wait for all rollouts in parallel (same pattern as round loop).
  # Skipped when --skip-preflight is set; round 1 will probe at whatever is live.
  local i
  local skip_first_apply=false
  if [[ "${SKIP_PREFLIGHT}" == "true" ]]; then
    log "  Pre-flight: skipped (--skip-preflight) — round 1 will probe at live limits"
    skip_first_apply=true
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      local lkm="${_cg_last_known_min[$i]}"
      _cg_low[$i]="${lkm}"
      _cg_high[$i]="${_cg_registry_max[$i]}"
    done
  else
    local any_preflight=false
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      local lkg="${_cg_last_known_good[$i]}"
      local lkm="${_cg_last_known_min[$i]}"
      local live_mi; live_mi="$(get_current_memory_limit_mi \
        "${_cg_kind[$i]}" "${_cg_name[$i]}" "${_cg_container[$i]}" "${_cg_ns[$i]}")"
      if [[ -n "${lkg}" && "${lkg}" -gt 0 && "${live_mi}" != "${lkg}" ]]; then
        log "  Pre-flight: ${_cg_name[$i]}/${_cg_container[$i]} live=${live_mi}Mi ≠ last_known_good=${lkg}Mi — will apply"
        apply_memory_limit "${_cg_kind[$i]}" "${_cg_name[$i]}" "${_cg_container[$i]}" "${lkg}" "${_cg_ns[$i]}"
        any_preflight=true
      else
        log "  Pre-flight: ${_cg_name[$i]}/${_cg_container[$i]} live=${live_mi}Mi = last_known_good=${lkg}Mi — no change needed"
      fi
      # Binary search between [last_known_min, max_memory_mi]
      _cg_low[$i]="${lkm}"
      _cg_high[$i]="${_cg_registry_max[$i]}"
    done
    if [[ "${any_preflight}" == "true" ]]; then
      log "  Pre-flight: waiting for all rollouts in parallel..."
      wait_for_rollouts
    fi
  fi

  local effective_granularity="${MEMORY_GRANULARITY_MI}"
  local round=0

  while true; do
    # Check convergence
    local all_converged=true
    local i
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      [[ "${_cg_converged[$i]}" != "true" ]] && all_converged=false && break
    done
    [[ "${all_converged}" == "true" ]] && break

    round=$(( round + 1 ))
    header "Round ${round} — probe_type=${probe_type}"

    # Reset per-round crash flags before rollout
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      _cg_crashed[$i]=false
    done

    # For relay-rpc: kill all existing port-forwards before touching the pod.
    # The pod will restart with a new hash — old tunnels would become invalid anyway.
    if [[ "${probe_type}" == "relay-rpc" ]]; then
      _kill_relay_portforwards
    fi

    # Compute mid for all non-converged components, then apply all limits at once.
    # Rollouts are triggered simultaneously; wait_for_rollouts monitors them in parallel.
    # Round 1 with --skip-preflight: use live limits as mid, skip applying (no change).
    local any_applied=false
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      [[ "${_cg_converged[$i]}" == "true" ]] && continue
      local range=$(( _cg_high[$i] - _cg_low[$i] ))
      local eff_gran="${effective_granularity}"
      if [[ ${range} -le ${eff_gran} ]]; then
        eff_gran=$(( range / 2 ))
        [[ ${eff_gran} -lt 1 ]] && eff_gran=1
      fi
      if [[ ${range} -le ${eff_gran} ]]; then
        log "  ${_cg_name[$i]}/${_cg_container[$i]} converged at best=${_cg_best[$i]}Mi"
        _cg_converged[$i]=true
        continue
      fi
      if [[ "${skip_first_apply}" == "true" ]]; then
        # Use the current live limit as the probe value — do not change anything.
        local live_mid; live_mid="$(get_current_memory_limit_mi \
          "${_cg_kind[$i]}" "${_cg_name[$i]}" "${_cg_container[$i]}" "${_cg_ns[$i]}")"
        _cg_mid[$i]="${live_mid}"
        log "  ${_cg_name[$i]}/${_cg_container[$i]}: round 1 probing at live=${live_mid}Mi (no change)  [${_cg_low[$i]}–${_cg_high[$i]}]"
      else
        _cg_mid[$i]=$(( (_cg_low[$i] + _cg_high[$i]) / 2 ))
        log "  ${_cg_name[$i]}/${_cg_container[$i]}: mid=${_cg_mid[$i]}Mi  [${_cg_low[$i]}–${_cg_high[$i]}]"
        apply_memory_limit "${_cg_kind[$i]}" "${_cg_name[$i]}" "${_cg_container[$i]}" \
          "${_cg_mid[$i]}" "${_cg_ns[$i]}"
        any_applied=true
      fi
    done
    skip_first_apply=false  # only skip on round 1

    # Wait for rollouts only if any limits were actually changed.
    [[ "${any_applied}" == "true" ]] && wait_for_rollouts

    # Re-check convergence after setting (some may have converged above)
    all_converged=true
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      [[ "${_cg_converged[$i]}" != "true" ]] && all_converged=false && break
    done
    [[ "${all_converged}" == "true" ]] && break

    # If every non-converged component crashed during rollout, skip the probe phase
    # and go straight to the next round (floors already raised above).
    local all_startup_crashed=true
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      [[ "${_cg_converged[$i]}" == "true" ]] && continue
      [[ "${_cg_crashed[$i]}" != "true" ]] && all_startup_crashed=false && break
    done
    if [[ "${all_startup_crashed}" == "true" ]]; then
      log "  All components crashed during rollout — skipping probe, advancing to next round"
      continue
    fi

    # Snapshot restart counts before probe
    cg_snapshot_restarts

    # For relay-rpc: pod is now Running — establish a fresh port-forward with a new port.
    # Workers will use this port; if setup fails, skip this round's probe.
    if [[ "${probe_type}" == "relay-rpc" ]]; then
      if ! _setup_relay_portforward; then
        log "  relay-rpc: skipping probe this round — no port-forward available"
        continue
      fi
    fi

    # For NLG: check haproxy IP hasn't changed; redeploy chart if it has.
    if [[ "${probe_type}" == "nlg" || "${probe_type}" == "both" ]]; then
      _maybe_refresh_nlg_chart
    fi

    # Start shared traffic for this category
    start_category_traffic "${probe_type}"

    # Monitor for the probe duration, checking all components every poll_interval
    local elapsed=0
    local poll_interval=10
    local probe_duration="${NLG_DURATION_S}"
    [[ "${probe_type}" == "query" ]] && probe_duration="${QUERY_DURATION_S}"
    local any_crashed=false
    local nlg_restart_count=0

    while [[ ${elapsed} -lt ${probe_duration} ]]; do
      sleep "${poll_interval}"
      elapsed=$(( elapsed + poll_interval ))
      cg_check_crashes
      # Heartbeat: show progress and per-component status every poll so the operator
      # can confirm traffic is running and the script has not hung.
      local _status_parts=()
      for i in $(seq 0 $(( _cg_count - 1 ))); do
        [[ "${_cg_converged[$i]}" == "true" ]] && continue
        if [[ "${_cg_crashed[$i]}" == "true" ]]; then
          _status_parts+=("${_cg_name[$i]}/${_cg_container[$i]}=CRASHED")
        else
          _status_parts+=("${_cg_name[$i]}/${_cg_container[$i]}=${_cg_mid[$i]}Mi-OK")
        fi
      done
      log "  Probe ${elapsed}s/${probe_duration}s — $(IFS=', '; echo "${_status_parts[*]}")"
      for i in $(seq 0 $(( _cg_count - 1 ))); do
        if [[ "${_cg_crashed[$i]}" == "true" ]]; then
          any_crashed=true
        fi
      done
      # Early exit: once every non-converged component has crashed there is no more
      # information to gather this round — break immediately so the binary search
      # can raise floors and start the next round without waiting out the full duration.
      local all_probed_crashed=true
      for i in $(seq 0 $(( _cg_count - 1 ))); do
        [[ "${_cg_converged[$i]}" == "true" ]] && continue
        [[ "${_cg_crashed[$i]}" != "true" ]] && all_probed_crashed=false && break
      done
      if [[ "${all_probed_crashed}" == "true" ]]; then
        log "  All components crashed — exiting probe early at ${elapsed}s"
        break
      fi
      # For NLG: verify the rapid-fire background process is still alive.
      # If it died early (e.g. gRPC setup timeout), log the tail and retry.
      if [[ "${probe_type}" == "nlg" || "${probe_type}" == "both" ]]; then
        local nlg_pid="${_cg_traffic_pids[0]:-}"
        if [[ -n "${nlg_pid}" ]] && ! kill -0 "${nlg_pid}" 2>/dev/null; then
          local nlg_exit_code=0
          wait "${nlg_pid}" 2>/dev/null || nlg_exit_code=$?
          log "  WARNING: NLG process (pid=${nlg_pid}) exited at ${elapsed}s (code=${nlg_exit_code})"
          tail -5 "${_cg_traffic_log}" 2>/dev/null | while IFS= read -r _tline; do log "    ${_tline}"; done || true
          local nlg_remaining=$(( probe_duration - elapsed ))
          if [[ "${nlg_restart_count}" -lt 3 && "${nlg_remaining}" -gt 30 ]]; then
            nlg_restart_count=$(( nlg_restart_count + 1 ))
            log "  Restarting NLG (attempt ${nlg_restart_count}/3, ${nlg_remaining}s remaining)..."
            sleep 5
            local nlg_retry_args="-c ${NLG_CLIENTS} -a ${NLG_ACCOUNTS} -t ${nlg_remaining}"
            npm run solo -- rapid-fire load start \
              --deployment "${SOLO_DEPLOYMENT}" \
              --test "${NLG_TEST_CLASS}" \
              --max-tps "${NLG_TPS}" \
              --java-heap "${NLG_JAVA_HEAP_GB}" \
              --args "\"${nlg_retry_args}\"" \
              --quiet-mode \
              >>"${_cg_traffic_log}" 2>&1 &
            _cg_traffic_pids[0]=$!
            log "  NLG restarted (pid=${_cg_traffic_pids[0]})"
          else
            log "  NLG restart limit reached or <30s remaining — probe continuing without NLG traffic"
            _cg_traffic_pids[0]=""
          fi
        fi
      fi
      # For relay-rpc: verify port-forward is still alive every poll cycle.
      # Workers suppress curl errors silently, so we must probe here to detect a dead tunnel.
      # Always check — even after a crash, so we can reconnect when the pod recovers.
      if [[ "${probe_type}" == "relay-rpc" && -n "${_cg_relay_local_port}" ]]; then
        local relay_url="http://localhost:${_cg_relay_local_port}"
        local relay_check_payload='{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
        local relay_check_resp
        relay_check_resp=$(curl -s -X POST -H "Content-Type: application/json" \
          --data "${relay_check_payload}" --max-time 3 "${relay_url}" 2>/dev/null || true)
        if [[ -n "${relay_check_resp}" ]]; then
          log "  relay-rpc: tunnel OK at ${elapsed}s (localhost:${_cg_relay_local_port} → pod/${_cg_relay_pod_name}:${_cg_relay_rpc_port})"
        else
          # Tunnel is dead — kill the stale port-forward process.
          kill "${_cg_traffic_pf_pid}" 2>/dev/null || true
          _cg_traffic_pf_pid=""
          # Find the current Running relay pod (name changes after every OOMKill restart).
          local current_pod
          current_pod=$(kubectl get pods -n "${SOLO_NAMESPACE}" --no-headers \
            | awk '$3=="Running"{print $1}' | grep "^relay-[0-9]" | grep -v "\-ws-" | head -1 || true)
          if [[ -z "${current_pod}" ]]; then
            log "  relay-rpc: no Running relay pod at ${elapsed}s — waiting (port localhost:${_cg_relay_local_port} reserved)"
          else
            if [[ "${current_pod}" != "${_cg_relay_pod_name}" ]]; then
              log "  relay-rpc: pod changed ${_cg_relay_pod_name} → ${current_pod}"
              _cg_relay_pod_name="${current_pod}"
            fi
            # Always reuse the same local port so workers connect through the new tunnel.
            log "  relay-rpc: (re)starting port-forward localhost:${_cg_relay_local_port} → pod/${_cg_relay_pod_name}:${_cg_relay_rpc_port}"
            kubectl port-forward -n "${SOLO_NAMESPACE}" "pod/${_cg_relay_pod_name}" \
              "${_cg_relay_local_port}:${_cg_relay_rpc_port}" >"${_cg_traffic_log}" 2>&1 &
            _cg_traffic_pf_pid=$!
            sleep 2
            relay_check_resp=$(curl -s -X POST -H "Content-Type: application/json" \
              --data "${relay_check_payload}" --max-time 3 "${relay_url}" 2>/dev/null || true)
            if [[ -n "${relay_check_resp}" ]]; then
              log "  relay-rpc: port-forward OK localhost:${_cg_relay_local_port} → pod/${_cg_relay_pod_name}:${_cg_relay_rpc_port} — restarting POST workers"
              _start_relay_workers
            else
              log "  relay-rpc: port-forward started, relay not yet responding on localhost:${_cg_relay_local_port} — pod may still be initializing"
            fi
          fi
        fi
      fi
      # Keep running even if some crashed — gather data for all components this round
    done

    stop_category_traffic

    # Update binary search state.
    # Rule: if ANY component crashed this round, only raise floors for crashed ones;
    # survivors hold their bounds (the shared load was disrupted, so their "pass"
    # is not a valid data point).  Only when ALL components pass do survivors lower
    # their ceiling and record a new best.
    for i in $(seq 0 $(( _cg_count - 1 ))); do
      [[ "${_cg_converged[$i]}" == "true" ]] && continue
      local mid="${_cg_mid[$i]}"
      [[ "${mid}" -eq 0 ]] && continue
      if [[ "${_cg_crashed[$i]}" == "true" ]]; then
        log "  FAIL ${_cg_name[$i]}/${_cg_container[$i]} at ${mid}Mi — raising floor"
        _cg_low[$i]="${mid}"
      elif [[ "${any_crashed}" == "true" ]]; then
        log "  PASS ${_cg_name[$i]}/${_cg_container[$i]} at ${mid}Mi — holding bounds (another component crashed this round)"
      else
        log "  PASS ${_cg_name[$i]}/${_cg_container[$i]} at ${mid}Mi — lowering ceiling, new best"
        _cg_high[$i]="${mid}"
        _cg_best[$i]="${mid}"
      fi
      # Check convergence
      local range=$(( _cg_high[$i] - _cg_low[$i] ))
      local eff_gran="${effective_granularity}"
      [[ ${range} -le ${eff_gran} ]] && eff_gran=$(( range / 2 ))
      [[ ${eff_gran} -lt 1 ]] && eff_gran=1
      if [[ ${range} -le ${eff_gran} ]]; then
        log "  ${_cg_name[$i]}/${_cg_container[$i]} converged at best=${_cg_best[$i]}Mi"
        _cg_converged[$i]=true
      fi
    done
  done

  # Apply best limits and write results
  local i
  for i in $(seq 0 $(( _cg_count - 1 ))); do
    if [[ "${_cg_best[$i]}" -gt 0 ]]; then
      log "Converged: ${_cg_kind[$i]}/${_cg_name[$i]} [${_cg_container[$i]}] = ${_cg_best[$i]}Mi  (was ${_cg_prev[$i]})"
      set_memory_limit "${_cg_kind[$i]}" "${_cg_name[$i]}" "${_cg_container[$i]}" \
        "${_cg_best[$i]}" "${_cg_ns[$i]}"
      printf "%-14s  %-40s  %-20s  %-18s  %s\n" \
        "OK" "${_cg_kind[$i]}/${_cg_name[$i]}" "${_cg_container[$i]}" \
        "${_cg_prev[$i]}" "${_cg_best[$i]}Mi" >> "${RESULTS_FILE}"
    else
      log "WARNING: no passing value found for ${_cg_kind[$i]}/${_cg_name[$i]} [${_cg_container[$i]}]"
      printf "%-14s  %-40s  %-20s  %-18s  %s\n" \
        "NOT FOUND" "${_cg_kind[$i]}/${_cg_name[$i]}" "${_cg_container[$i]}" \
        "${_cg_prev[$i]}" ">(${_cg_high[$i]}Mi)" >> "${RESULTS_FILE}"
    fi
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

# ── Argument parsing ─────────────────────────────────────────────────────────────

MODE=""             # "auto" | "by-probe-type" | "manual"
SELECTED=()         # aliases to optimize
FILTER_PROBE_TYPE=""  # set by --probe-type

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list)
      list_components
      exit 0   # exits before trap is registered — no NLG cleanup triggered
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
    --probe-type)
      MODE="by-probe-type"
      FILTER_PROBE_TYPE="$2"
      shift 2
      ;;
    --namespace|-n)    SOLO_NAMESPACE="$2";        shift 2 ;;
    --deployment|-d)   SOLO_DEPLOYMENT="$2";       shift 2 ;;
    --min-memory)      MEMORY_MIN_MI="$2";         shift 2 ;;
    --max-memory)      MEMORY_MAX_MI="$2";         shift 2 ;;
    --granularity)     MEMORY_GRANULARITY_MI="$2"; shift 2 ;;
    --tps)             NLG_TPS="$2";               shift 2 ;;
    --duration)        NLG_DURATION_S="$2";        shift 2 ;;
    --query-duration)  QUERY_DURATION_S="$2";      shift 2 ;;
    --nlg-test)        NLG_TEST_CLASS="$2";        shift 2 ;;
    --skip-preflight)  SKIP_PREFLIGHT=true;        shift ;;
    *)
      echo "Unknown argument: $1"
      echo "Run with --list to see component aliases, or --help for usage."
      exit 1
      ;;
  esac
done

if [[ -z "${MODE}" ]]; then
  echo "Error: specify --components ALIAS[,...], --probe-type TYPE, or --auto"
  echo ""
  list_components
  exit 1
fi

# Register cleanup trap only now — after early-exit paths (--list, bad args)
trap on_exit EXIT

# Build SELECTED from registry based on chosen mode
if [[ "${MODE}" == "auto" ]]; then
  for entry in "${COMPONENT_REGISTRY[@]}"; do
    SELECTED+=("$(cut -d'|' -f1 <<< "${entry}")")
  done
elif [[ "${MODE}" == "by-probe-type" ]]; then
  valid_types="nlg relay-rpc query both none"
  if ! echo "${valid_types}" | grep -qw "${FILTER_PROBE_TYPE}"; then
    echo "Error: --probe-type must be one of: ${valid_types}"
    exit 1
  fi
  for entry in "${COMPONENT_REGISTRY[@]}"; do
    alias="$(cut -d'|' -f1 <<< "${entry}")"
    probe_type="$(cut -d'|' -f6 <<< "${entry}")"
    probe_type="${probe_type:-nlg}"
    # A component with probe_type=both belongs to both nlg and relay-rpc groups.
    if [[ "${probe_type}" == "${FILTER_PROBE_TYPE}" ]] || \
       [[ "${probe_type}" == "both" && ( "${FILTER_PROBE_TYPE}" == "nlg" || "${FILTER_PROBE_TYPE}" == "relay-rpc" ) ]]; then
      SELECTED+=("${alias}")
    fi
  done
  if [[ ${#SELECTED[@]} -eq 0 ]]; then
    echo "No components registered with probe-type '${FILTER_PROBE_TYPE}'"
    exit 1
  fi
fi

# ── Main ────────────────────────────────────────────────────────────────────────

header "Solo Memory Optimizer"
cat <<INFO
  Namespace:    ${SOLO_NAMESPACE}
  Deployment:   ${SOLO_DEPLOYMENT}
  Mode:         ${MODE}
  Components:   ${SELECTED[*]}
  Memory range: ${MEMORY_MIN_MI}Mi – ${MEMORY_MAX_MI}Mi  (granularity ${MEMORY_GRANULARITY_MI}Mi)
  NLG test:     ${NLG_TEST_CLASS}
  NLG load:     ${NLG_TPS} TPS × ${NLG_DURATION_S}s per probe
  Query load:   ${NLG_TPS} RPS × ${QUERY_DURATION_S}s per probe
  Skip preflight: ${SKIP_PREFLIGHT}
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
  printf "%-14s  %-40s  %-20s  %-18s  %s\n" "STATUS" "RESOURCE" "CONTAINER" "PREV LIMIT" "MIN MEMORY"
  printf "%-14s  %-40s  %-20s  %-18s  %s\n" "------" "--------" "---------" "----------" "----------"
} > "${RESULTS_FILE}"

# Group selected components by probe_type and optimize each group.
# Use a bash 3-compatible approach (no declare -A) by iterating over known probe types.
for probe_type in nlg relay-rpc query; do
  filtered=()
  for alias in "${SELECTED[@]}"; do
    local_probe_type="$(registry_field "${alias}" 6)"
    local_probe_type="${local_probe_type:-nlg}"
    # probe_type=both: include in both nlg and relay-rpc groups
    if [[ "${local_probe_type}" == "${probe_type}" ]] || \
       [[ "${local_probe_type}" == "both" && ( "${probe_type}" == "nlg" || "${probe_type}" == "relay-rpc" ) ]]; then
      filtered+=("${alias}")
    fi
  done
  [[ ${#filtered[@]} -gt 0 ]] && optimize_category_group "${probe_type}" "${filtered[@]}"
done

# Print summary
header "Optimization Complete"
cat "${RESULTS_FILE}"
log "Full results written to: ${RESULTS_FILE}"
