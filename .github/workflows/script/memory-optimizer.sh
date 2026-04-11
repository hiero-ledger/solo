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
#   # Optimize all components that use a specific probe type:
#   ./memory-optimizer.sh --probe-type nlg        # NLG write path (importer, postgres, redis)
#   ./memory-optimizer.sh --probe-type query      # mirror read path (grpc, rest, restjava)
#   ./memory-optimizer.sh --probe-type relay-rpc  # relay JSON-RPC path (relay, relay-ws, web3)
#   ./memory-optimizer.sh --probe-type both       # both write paths (network-node)
#   ./memory-optimizer.sh --probe-type none       # observation-only (mirror-monitor)
#
#   # Optimize all known components automatically:
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
#   --min-memory MI                     Memory search lower bound Mi  (default: 128)
#   --max-memory MI                     Memory search upper bound Mi  (default: 4096)
#   --granularity MI                    Stop when range ≤ this Mi     (default: 64)
#   --tps N                             NLG transactions per second   (default: 100)
#   --duration S                        NLG probe duration seconds    (default: 300)
#   --nlg-test TYPE                     NLG test class to run         (default: CryptoTransferLoadTest)
#                                         CryptoTransferLoadTest
#                                         NftTransferLoadTest
#                                         TokenTransferLoadTest
#                                         HCSLoadTest
#                                         SmartContractLoadTest

set -eo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────────

SOLO_NAMESPACE="${SOLO_NAMESPACE:-solo}"
SOLO_DEPLOYMENT="${SOLO_DEPLOYMENT:-solo}"
MEMORY_MIN_MI="${MEMORY_MIN_MI:-128}"
MEMORY_MAX_MI="${MEMORY_MAX_MI:-4096}"
MEMORY_GRANULARITY_MI="${MEMORY_GRANULARITY_MI:-64}"
NLG_TPS="${NLG_TPS:-100}"
NLG_DURATION_S="${NLG_DURATION_S:-300}"
NLG_CLIENTS="${NLG_CLIENTS:-5}"
NLG_ACCOUNTS="${NLG_ACCOUNTS:-20}"
NLG_JAVA_HEAP_GB="${NLG_JAVA_HEAP_GB:-4}"
NLG_TEST_CLASS="${NLG_TEST_CLASS:-CryptoTransferLoadTest}"
STABILIZE_S="${STABILIZE_S:-15}"
RESULTS_FILE="memory-optimization-$(date '+%Y%m%d-%H%M%S').txt"

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
#   Component        NLG writes (gRPC)      Relay JSON-RPC         Client queries    probe_type
#   ─────────────    ─────────────────────  ─────────────────────  ───────────────   ──────────
#   network-node     DIRECT (consensus)     DIRECT (relay→grpc)    none              both
#   mirror-importer  DIRECT (record stream) indirect               none              nlg
#   mirror-grpc      none                   none                   DIRECT (gRPC sub) query
#   mirror-rest      indirect (data source) indirect (polls REST)  DIRECT (GET)      query
#   mirror-restjava  indirect (data source) indirect               DIRECT (GET)      query
#   mirror-web3      none                   DIRECT (eth_call)      indirect          relay-rpc
#   mirror-monitor   none                   none                   none (health only) none
#   relay            none (bypassed)        DIRECT (entry point)   none              relay-rpc
#   relay-ws         none (bypassed)        DIRECT (WS entry)      none              relay-rpc
#   postgres         DIRECT (all writes)    indirect               indirect (reads)  nlg
#   redis            indirect (cache)       indirect               indirect (cache)  nlg
#
# Memory sources (max_memory_mi):
#   mirror-*    resources/mirror-node-values.yaml  <component>.resources.limits.memory
#   network-node resources/solo-values.yaml        JAVA_HEAP_MAX=6g + JVM overhead → 8192Mi
#   relay*      resources/relay-values.yaml        no limit defined → 512Mi
#   postgres    resources/mirror-node-values.yaml  postgresql.postgresql.resources.limits.memory
#   redis       not defined in chart values        → 512Mi per container
#
# When multiple containers are listed (e.g. redis,sentinel) each is optimized
# as a separate binary-search pass against the same workload.

COMPONENT_REGISTRY=(
  # ── Both transaction paths hit network-node directly ──────────────────────────
  "network-node|statefulset|^network-node[0-9]||8192|both"

  # ── NLG path: CryptoTransfer → gRPC 50211 → record stream → mirror-importer ──
  "mirror-importer|deployment|mirror.*importer||596|nlg"
  "postgres|statefulset|solo-shared-resources-postgres|postgresql|1000|nlg"
  "redis|statefulset|solo-shared-resources-redis-node|redis,sentinel|512|nlg"

  # ── Query path: client read requests → mirror REST/gRPC services ──────────────
  # mirror-grpc memory is driven by concurrent gRPC subscriptions, not writes
  # mirror-rest / mirror-restjava memory is driven by concurrent GET requests
  "mirror-grpc|deployment|mirror.*grpc||1000|query"
  "mirror-rest|deployment|mirror.*-rest$||500|query"
  "mirror-restjava|deployment|mirror.*restjava||500|query"

  # ── Relay JSON-RPC path: eth_* → port 7546/7547 → relay → gRPC / mirror-web3 ─
  "relay|deployment|^relay-[0-9]+$||512|relay-rpc"
  "relay-ws|deployment|^relay-[0-9]+-ws$||512|relay-rpc"
  "mirror-web3|deployment|mirror.*web3||1000|relay-rpc"

  # ── No meaningful transaction-load impact; apply limit for observation only ───
  "mirror-monitor|deployment|mirror.*monitor||1000|none"
)

# ── Helpers ──────────────────────────────────────────────────────────────────────

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

header() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  printf "  %s\n" "$*"
  echo "════════════════════════════════════════════════════════════"
}

# Lookup a field (2=kind, 3=pattern, 4=containers, 5=max_memory_mi, 6=probe_type) for a given alias (field 1)
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
  printf "  %-18s  %-12s  %-34s  %-20s  %-12s  %s\n" "ALIAS" "KIND" "NAME PATTERN" "CONTAINERS" "PROBE" "MAX MEMORY"
  printf "  %-18s  %-12s  %-34s  %-20s  %-12s  %s\n" "-----" "----" "------------" "----------" "-----" "----------"
  local entry
  for entry in "${COMPONENT_REGISTRY[@]}"; do
    IFS='|' read -r alias kind pattern containers max_mi probe_type <<< "${entry}"
    containers="${containers:-<auto>}"
    local max_display
    if [[ -n "${max_mi}" ]]; then
      max_display="${max_mi}Mi"
    else
      max_display="${MEMORY_MAX_MI}Mi (global default)"
    fi
    printf "  %-18s  %-12s  %-34s  %-20s  %-12s  %s\n" \
      "${alias}" "${kind}" "${pattern}" "${containers}" "${probe_type:-nlg}" "${max_display}"
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

# Poll pods belonging to a workload for unhealthy states.
# Prints a reason string and returns 0 if a bad state is found, 1 otherwise.
check_pod_health() {
  local resource_name="$1"
  local container="$2"

  local pod
  while IFS= read -r pod; do
    [[ -z "${pod}" ]] && continue

    # Phase-level failures (e.g. pod stuck in Error)
    local phase
    phase=$(kubectl get pod "${pod}" -n "${SOLO_NAMESPACE}" \
      -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
    if [[ "${phase}" == "Failed" ]]; then
      log "  Pod ${pod} in Failed phase"
      return 0
    fi

    # Container-level failures: CrashLoopBackOff or OOMKilled in waiting or lastState
    local reasons
    reasons=$(kubectl get pod "${pod}" -n "${SOLO_NAMESPACE}" -o json 2>/dev/null \
      | jq -r --arg c "${container}" '
          .status.containerStatuses[]?
          | select(.name == $c)
          | (.state.waiting.reason // ""),
            (.lastState.terminated.reason // "")
        ' 2>/dev/null || echo "")

    if echo "${reasons}" | grep -qE "OOMKilled|CrashLoopBackOff|Error"; then
      local cause
      cause=$(echo "${reasons}" | grep -E "OOMKilled|CrashLoopBackOff|Error" | head -1)
      log "  Pod ${pod} container ${container}: ${cause}"
      return 0
    fi
  done < <(kubectl get pods -n "${SOLO_NAMESPACE}" --no-headers -o name 2>/dev/null \
    | sed 's|pod/||' | grep "^${resource_name}-")

  return 1
}

# Patch one container's memory limit + request on a workload, then wait for rollout
# while concurrently watching for CrashLoopBackOff / OOMKilled.
# Returns 0 on clean rollout, 1 if the pod crashed during startup.
set_memory_limit() {
  local kind="$1"
  local name="$2"
  local container="$3"
  local memory_mi="$4"
  local request_mi=$(( memory_mi / 2 ))

  log "  kubectl set resources ${kind}/${name} -c ${container} --limits=memory=${memory_mi}Mi --requests=memory=${request_mi}Mi"

  # Primary: kubectl set resources
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

  log "  Waiting for rollout of ${kind}/${name} (monitoring for OOMKilled/CrashLoopBackOff)..."

  # Run rollout status in the background; poll concurrently for crash states
  kubectl rollout status "${kind}/${name}" -n "${SOLO_NAMESPACE}" --timeout=300s \
    >/dev/null 2>&1 &
  local rollout_pid=$!

  local elapsed=0
  local poll_interval=5
  local crashed=false

  while kill -0 "${rollout_pid}" 2>/dev/null; do
    sleep "${poll_interval}"
    elapsed=$(( elapsed + poll_interval ))

    if check_pod_health "${name}" "${container}"; then
      log "  Rollout aborted — pod crashed at ${memory_mi}Mi (see above)"
      kill "${rollout_pid}" 2>/dev/null || true
      crashed=true
      break
    fi
  done

  wait "${rollout_pid}" 2>/dev/null || true

  if [[ "${crashed}" == "true" ]]; then
    return 1
  fi

  log "  Rollout complete. Stabilizing ${STABILIZE_S}s..."
  sleep "${STABILIZE_S}"
  return 0
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

  # Discover JSON-RPC service port; fall back to 7546
  local rpc_port
  rpc_port=$(kubectl get svc "${resource_name}" -n "${SOLO_NAMESPACE}" \
    -o jsonpath='{.spec.ports[?(@.name=="http")].port}' 2>/dev/null || echo "")
  rpc_port="${rpc_port:-7546}"

  # Pick an unused local port for the port-forward
  local local_port=$(( (RANDOM % 10000) + 40000 ))

  log "  Relay RPC probe: port-forward ${pod_name}:${rpc_port} → localhost:${local_port} for ${NLG_DURATION_S}s"

  kubectl port-forward -n "${SOLO_NAMESPACE}" "pod/${pod_name}" \
    "${local_port}:${rpc_port}" >/dev/null 2>&1 &
  local pf_pid=$!
  sleep 3  # Let the port-forward establish

  local rpc_payload='{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
  local oom_detected=false
  local success_count=0
  local fail_count=0
  local elapsed=0
  local poll_interval=5

  # Background load loop: send NLG_TPS requests per second in parallel
  (
    while kill -0 "${pf_pid}" 2>/dev/null; do
      local i
      for i in $(seq 1 "${NLG_TPS}"); do
        curl -sf -X POST \
          -H "Content-Type: application/json" \
          --data "${rpc_payload}" \
          --max-time 5 \
          "http://localhost:${local_port}" >/dev/null 2>&1 &
      done
      wait
      sleep 1
    done
  ) &
  local load_pid=$!

  while [[ ${elapsed} -lt ${NLG_DURATION_S} ]]; do
    sleep "${poll_interval}"
    elapsed=$(( elapsed + poll_interval ))

    if check_oom "${resource_name}" "${container}"; then
      log "  OOMKilled detected on ${resource_name}/${container}"
      oom_detected=true
      break
    fi

    # Connectivity health-check
    if curl -sf -X POST \
        -H "Content-Type: application/json" \
        --data "${rpc_payload}" \
        --max-time 5 \
        "http://localhost:${local_port}" >/dev/null 2>&1; then
      success_count=$(( success_count + 1 ))
    else
      fail_count=$(( fail_count + 1 ))
    fi
  done

  kill "${load_pid}" 2>/dev/null || true
  kill "${pf_pid}" 2>/dev/null || true
  wait "${load_pid}" "${pf_pid}" 2>/dev/null || true

  local total=$(( success_count + fail_count ))
  if [[ "${oom_detected}" == "true" ]]; then
    log "  Relay RPC probe FAILED (OOMKilled)"
    return 1
  fi
  if [[ ${total} -gt 0 && ${fail_count} -gt $(( total / 3 )) ]]; then
    log "  Relay RPC probe FAILED (${fail_count}/${total} health checks failed)"
    return 1
  fi

  log "  Relay RPC probe PASSED (${success_count}/${total} health checks ok)"
  return 0
}

# Run a read-query load against a mirror service (REST or gRPC).
# Strategy:
#   - mirror-grpc: use grpcurl for gRPC health/subscribe probes if available;
#                  fall back to TCP port-forward connectivity check.
#   - All others:  port-forward to the service HTTP port and send concurrent GET
#                  requests to the /actuator/health or /api/v1/transactions endpoint.
# Returns 0 (pass) or 1 (fail / OOM / connection errors).
run_query_probe() {
  local resource_name="$1"
  local container="$2"

  local pod_name
  pod_name=$(kubectl get pods -n "${SOLO_NAMESPACE}" --no-headers \
    | awk '{print $1}' | grep "^${resource_name}-" | head -1 || true)

  if [[ -z "${pod_name}" ]]; then
    log "  No pod found for ${resource_name} — cannot run query probe"
    return 1
  fi

  # Discover first service port; fall back by component name pattern
  local svc_port
  svc_port=$(kubectl get svc "${resource_name}" -n "${SOLO_NAMESPACE}" \
    -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "")

  # Determine protocol and query endpoint based on component name
  local is_grpc=false
  local query_path="/actuator/health"
  if echo "${resource_name}" | grep -q "grpc"; then
    is_grpc=true
    svc_port="${svc_port:-5600}"
  elif echo "${resource_name}" | grep -q "restjava"; then
    svc_port="${svc_port:-8084}"
    query_path="/api/v1/transactions?limit=1"
  else
    # mirror-rest
    svc_port="${svc_port:-5551}"
    query_path="/api/v1/transactions?limit=1"
  fi

  local local_port=$(( (RANDOM % 10000) + 41000 ))
  log "  Query probe: port-forward ${pod_name}:${svc_port} → localhost:${local_port} for ${NLG_DURATION_S}s"

  kubectl port-forward -n "${SOLO_NAMESPACE}" "pod/${pod_name}" \
    "${local_port}:${svc_port}" >/dev/null 2>&1 &
  local pf_pid=$!
  sleep 3

  local oom_detected=false
  local success_count=0
  local fail_count=0
  local elapsed=0
  local poll_interval=5

  # Background load: NLG_TPS concurrent requests per second
  if [[ "${is_grpc}" == "true" ]] && command -v grpcurl >/dev/null 2>&1; then
    log "  Using grpcurl for gRPC health checks"
    (
      while kill -0 "${pf_pid}" 2>/dev/null; do
        local i
        for i in $(seq 1 "${NLG_TPS}"); do
          grpcurl -plaintext -max-time 5 \
            "localhost:${local_port}" grpc.health.v1.Health/Check \
            >/dev/null 2>&1 &
        done
        wait
        sleep 1
      done
    ) &
  else
    # HTTP GET load (also serves as gRPC fallback via actuator)
    local url="http://localhost:${local_port}${query_path}"
    log "  Using HTTP GET: ${url}"
    (
      while kill -0 "${pf_pid}" 2>/dev/null; do
        local i
        for i in $(seq 1 "${NLG_TPS}"); do
          curl -sf --max-time 5 "${url}" >/dev/null 2>&1 &
        done
        wait
        sleep 1
      done
    ) &
  fi
  local load_pid=$!

  while [[ ${elapsed} -lt ${NLG_DURATION_S} ]]; do
    sleep "${poll_interval}"
    elapsed=$(( elapsed + poll_interval ))

    if check_oom "${resource_name}" "${container}"; then
      log "  OOMKilled detected on ${resource_name}/${container}"
      oom_detected=true
      break
    fi

    # Health-check poll
    local ok=false
    if [[ "${is_grpc}" == "true" ]] && command -v grpcurl >/dev/null 2>&1; then
      grpcurl -plaintext -max-time 5 \
        "localhost:${local_port}" grpc.health.v1.Health/Check \
        >/dev/null 2>&1 && ok=true
    else
      curl -sf --max-time 5 "http://localhost:${local_port}${query_path}" \
        >/dev/null 2>&1 && ok=true
    fi
    if [[ "${ok}" == "true" ]]; then
      success_count=$(( success_count + 1 ))
    else
      fail_count=$(( fail_count + 1 ))
    fi
  done

  kill "${load_pid}" 2>/dev/null || true
  kill "${pf_pid}" 2>/dev/null || true
  wait "${load_pid}" "${pf_pid}" 2>/dev/null || true

  local total=$(( success_count + fail_count ))
  if [[ "${oom_detected}" == "true" ]]; then
    log "  Query probe FAILED (OOMKilled)"
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
      run_nlg_probe "${resource_name}" "${container}" || return 1
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
# $4 = max_mi override (falls back to global MEMORY_MAX_MI when absent)
# $5 = probe_type (defaults to nlg)
optimize_one() {
  local kind="$1"
  local name="$2"
  local container="$3"
  local max_mi="${4:-${MEMORY_MAX_MI}}"
  local probe_type="${5:-nlg}"

  header "Optimizing ${kind}/${name}  container: ${container}  probe: ${probe_type}  [${MEMORY_MIN_MI}–${max_mi}Mi]"

  local low="${MEMORY_MIN_MI}"
  local high="${max_mi}"
  local best_mi=0
  local iteration=0

  while [[ $(( high - low )) -gt "${MEMORY_GRANULARITY_MI}" ]]; do
    iteration=$(( iteration + 1 ))
    local mid=$(( (low + high) / 2 ))
    log "Iter ${iteration}: testing ${mid}Mi  [range ${low}–${high}]"

    if ! set_memory_limit "${kind}" "${name}" "${container}" "${mid}"; then
      log "FAILURE at ${mid}Mi — pod crashed during startup (OOMKilled/CrashLoopBackOff)"
      low="${mid}"
      continue
    fi

    if run_probe "${probe_type}" "${name}" "${container}"; then
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
  local component_max_mi; component_max_mi="$(registry_field "${alias}" 5)"
  local probe_type; probe_type="$(registry_field "${alias}" 6)"
  probe_type="${probe_type:-nlg}"
  # Use component-specific max if defined, otherwise fall back to global --max-memory
  local effective_max_mi="${component_max_mi:-${MEMORY_MAX_MI}}"

  if [[ -z "${kind}" ]]; then
    log "Unknown component alias '${alias}' — use --list to see valid aliases"
    return 1
  fi

  log "Component ${alias}: max=${effective_max_mi}Mi probe=${probe_type}"

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
      optimize_one "${kind}" "${name}" "${container}" "${effective_max_mi}" "${probe_type}"
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
    --nlg-test)        NLG_TEST_CLASS="$2";        shift 2 ;;
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
    IFS='|' read -r alias _ _ _ _ probe_type <<< "${entry}"
    if [[ "${probe_type}" == "${FILTER_PROBE_TYPE}" ]]; then
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
