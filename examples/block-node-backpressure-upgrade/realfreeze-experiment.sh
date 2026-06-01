#!/usr/bin/env bash
# Reproduce hiero-consensus-node PR #25501 "can't self-heal" case on Solo (kind):
# a node back-pressured during an upgrade ends up on a different hedera.config.version
# than the rest, hits a fatal ISS, and the network can't recover on its own.
# Usage: ./reproduce.sh [recover|teardown]
set -uo pipefail

CLUSTER_NAME="bn-backpressure"
CONTEXT="kind-${CLUSTER_NAME}"
CLUSTER_REF="${CONTEXT}"
NAMESPACE="namespace-bn-bp"
DEPLOYMENT="deployment-bn-bp"
NODES=4
NODE_ALIASES="node1,node2,node3,node4"
SKEW_NODES="2 3 4"            # take the simulated upgrade; node1 is the straggler
NEW_CONFIG_VERSION=1
LOAD_BURST=20
MONITOR="${MONITOR:-1}"      # MONITOR=0 disables the live status stream
MON_INTERVAL=4
MON_PID=""
STREAM_PORT=40840            # consensus-node -> block-node gRPC stream

# kind 0.31's default image (v1.35.0) fails to boot the kubelet on current Docker.
KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"

LOG_DIR="/opt/hgcapp/services-hedera/HapiApp2.0/output"
KCTL="kubectl --context ${CONTEXT}"   # solo switches the current context mid-run, so be explicit

ROOT="$(cd "$(dirname "$0")" && git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CN_VERSION="$(sed -n "s/.*TEST_UPGRADE_FROM_VERSION.*'\([^']*\)'.*/\1/p" "${ROOT}/version-test.ts")"
BN_VERSION="$(sed -n "s/.*PREV_BLOCK_NODE_VERSION.*'\([^']*\)'.*/\1/p" "${ROOT}/version-test.ts")"
UPGRADE_VERSION="$(sed -n "s/.*HEDERA_PLATFORM_VERSION.*||[[:space:]]*'\([^']*\)'.*/\1/p" "${ROOT}/version.ts")"
: "${CN_VERSION:=v0.72.0}" ; : "${BN_VERSION:=v0.31.0}" ; : "${UPGRADE_VERSION:=v0.73.0}"

if   [ "${USE_RELEASED_VERSION:-}" = "true" ]; then SOLO_MODE="npx"
elif [ -f "${ROOT}/dist/solo.js" ];           then SOLO_MODE="dist"
elif [ -f "${ROOT}/solo.ts" ];                then SOLO_MODE="tsx"
elif command -v solo >/dev/null 2>&1;         then SOLO_MODE="global"
else                                               SOLO_MODE="tsx"; fi

solo() {
  case "${SOLO_MODE}" in
    dist)   ( cd "${ROOT}" && node --no-deprecation --no-warnings dist/solo.js "$@" ) ;;
    tsx)    ( cd "${ROOT}" && npm run --silent solo-test -- "$@" ) ;;
    npx)    npx @hashgraph/solo "$@" ;;
    global) command solo "$@" ;;
  esac
}

log()  { printf '\n\033[1;36m========== %s ==========\033[0m\n' "$*"; }
sub()  { printf '   %s\n' "$*"; }
ok()   { printf '   \033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '   \033[1;33m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required tool not found: $1"; }

# Platform status / back-pressure / ISS lines go to files under output/, not pod
# stdout, so everything below greps the files via exec (no node client involved).
node_status() {
  ${KCTL} exec -n "${NAMESPACE}" "network-node$1-0" -c root-container -- \
    sh -c "grep -h 'Now in' ${LOG_DIR}/swirlds.log 2>/dev/null | tail -1" 2>/dev/null \
    | sed -E 's/.*Now in ([A-Z_]+).*/\1/'
}

node_iss_count() {
  ${KCTL} exec -n "${NAMESPACE}" "network-node$1-0" -c root-container -- \
    sh -c "grep -hc 'Invalid State Signature' ${LOG_DIR}/swirlds.log 2>/dev/null" 2>/dev/null \
    | tr -dc '0-9'
}

print_statuses() {
  for n in $(seq 1 "${NODES}"); do
    local st iss; st="$(node_status "$n")"; iss="$(node_iss_count "$n")"
    printf '   node%s: %-22s ISS lines: %s\n' "$n" "${st:-UNKNOWN}" "${iss:-0}"
  done
}

# Live stream of status transitions + first ISS per node. Indexed arrays only (bash 3.2).
monitor_start() {
  [ "${MONITOR}" = "1" ] || return 0
  [ -n "${MON_PID}" ] && return 0
  sub "[monitor on] streaming node status + ISS every ${MON_INTERVAL}s (MONITOR=0 to disable)"
  (
    prev=(); issflag=()
    while :; do
      for n in $(seq 1 "${NODES}"); do
        s="$(node_status "$n" 2>/dev/null)"
        if [ -n "${s}" ] && [ "${s}" != "${prev[$n]:-}" ]; then
          printf '   \033[2m[mon %s] node%s: %s%s\033[0m\n' \
            "$(date +%H:%M:%S)" "$n" "${prev[$n]:+${prev[$n]} -> }" "${s}"
          prev[$n]="${s}"
        fi
        c="$(node_iss_count "$n" 2>/dev/null)"; c="${c:-0}"
        if [ -z "${issflag[$n]:-}" ] && [ "${c}" -gt 0 ] 2>/dev/null; then
          printf '   \033[2m[mon %s] node%s: ISS (Invalid State Signature) detected\033[0m\n' \
            "$(date +%H:%M:%S)" "$n"
          issflag[$n]=1
        fi
      done
      sleep "${MON_INTERVAL}"
    done
  ) &
  MON_PID=$!
  disown 2>/dev/null || true   # so killing it later prints no "Terminated" job message
}

monitor_stop() {
  [ -n "${MON_PID}" ] || return 0
  kill "${MON_PID}" 2>/dev/null || true
  pkill -P "${MON_PID}" 2>/dev/null || true
  MON_PID=""
}

wait_status() {  # <n> <status> <timeout>
  local n="$1" want="$2" timeout="$3" deadline
  deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    [ "$(node_status "$n")" = "${want}" ] && return 0
    sleep 5
  done
  return 1
}

wait_any_status() {  # <n> <timeout> <status...> -> echoes the status reached
  local n="$1" timeout="$2"; shift 2; local deadline cur
  deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    cur="$(node_status "$n")"
    for s in "$@"; do [ "${cur}" = "$s" ] && { echo "${cur}"; return 0; }; done
    sleep 5
  done
  echo "$(node_status "$n")"; return 1
}

wait_log() {  # <n> <pattern> <timeout>
  local n="$1" pat="$2" timeout="$3" deadline
  deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    ${KCTL} exec -n "${NAMESPACE}" "network-node$1-0" -c root-container -- \
      sh -c "grep -rqF '${pat}' ${LOG_DIR} 2>/dev/null" 2>/dev/null && return 0
    sleep 5
  done
  return 1
}

log_has() {  # <n> <pattern>  (single grep, for fast polling)
  ${KCTL} exec -n "${NAMESPACE}" "network-node$1-0" -c root-container -- \
    sh -c "grep -rqF '$2' ${LOG_DIR} 2>/dev/null" 2>/dev/null
}

wait_ready() { ${KCTL} wait --for=condition=Ready "pod/network-node$1-0" -n "${NAMESPACE}" --timeout=200s >/dev/null 2>&1; }

# Stall node1 -> block-node acks by dropping only that stream at the kind node, by
# source IP, so the block-node's kubelet liveness probe still passes and the pod
# stays up (scaling it to 0 makes Solo's pre-flight fail "Block Node ... not found").
stall_acks() {  # <on|off>
  local knode="${CLUSTER_NAME}-control-plane" cn_ip bn_ip spec
  cn_ip="$(${KCTL} get pod network-node1-0 -n "${NAMESPACE}" -o jsonpath='{.status.podIP}' 2>/dev/null)"
  bn_ip="$(${KCTL} get pod block-node-1-0  -n "${NAMESPACE}" -o jsonpath='{.status.podIP}' 2>/dev/null)"
  [ -n "${cn_ip}" ] && [ -n "${bn_ip}" ] || { warn "could not resolve pod IPs for stall (cn=${cn_ip} bn=${bn_ip})"; return 1; }
  spec="-s ${cn_ip} -d ${bn_ip} -p tcp --dport ${STREAM_PORT} -j DROP"
  if [ "$1" = "on" ]; then
    docker exec "${knode}" iptables -C FORWARD ${spec} 2>/dev/null \
      || docker exec "${knode}" iptables -I FORWARD 1 ${spec}
  else
    docker exec "${knode}" iptables -D FORWARD ${spec} 2>/dev/null || true
  fi
}

# Set/clear node <n>'s hedera.config.version via a -D JVM property (outranks the
# properties file, survives restart) and bounce the pod; preserves Solo's own flags.
set_cfg_version() {  # <n> <set|clear> [version]
  local n="$1" mode="$2" ver="${3:-1}" cur stripped new
  cur="$(${KCTL} get statefulset "network-node${n}" -n "${NAMESPACE}" \
        -o jsonpath="{range .spec.template.spec.containers[?(@.name=='root-container')].env[?(@.name=='JAVA_OPTS')]}{.value}{end}" 2>/dev/null)"
  stripped="$(printf '%s' "${cur}" | sed -E 's/ *-Dhedera\.config\.version=[0-9]+//g')"
  if [ "${mode}" = "set" ]; then new="${stripped} -Dhedera.config.version=${ver}"; else new="${stripped}"; fi
  ${KCTL} set env "statefulset/network-node${n}" -n "${NAMESPACE}" -c root-container JAVA_OPTS="${new}" >/dev/null 2>&1
  ${KCTL} delete pod "network-node${n}-0" -n "${NAMESPACE}" --wait=false >/dev/null 2>&1 || true
}

# Best-effort load txn, killed after <timeout>s so a wedged-node retry can't stall the loop.
bounded_solo() {  # <timeout> <solo args...>
  local t="$1"; shift
  ( cd "${ROOT}"; solo "$@" >/dev/null 2>&1 ) &
  local pid=$! end=$(( $(date +%s) + t ))
  while kill -0 "${pid}" 2>/dev/null; do
    if [ "$(date +%s)" -ge "${end}" ]; then
      disown 2>/dev/null || true
      pkill -P "${pid}" 2>/dev/null; kill "${pid}" 2>/dev/null
      return 0
    fi
    sleep 2
  done
  wait "${pid}" 2>/dev/null || true
}

# Retry transient ghcr.io pull failures; a failed helm install leaves no committed state.
add_block_node() {  # <n>
  local n="$1" attempt
  for attempt in 1 2 3; do
    solo block node add --deployment "${DEPLOYMENT}" --release-tag "${CN_VERSION}" \
      --chart-version "${BN_VERSION}" --priority-mapping "node${n}=2" && return 0
    warn "block node add (node${n}) attempt ${attempt}/3 failed; retrying ..."
    helm uninstall "block-node-${n}" -n "${NAMESPACE}" --kube-context "${CONTEXT}" >/dev/null 2>&1 || true
    sleep 20
  done
  return 1
}

# Make Solo's node client tolerate an unreachable node so upgrade/freeze can run
# while one node is wedged (builds the client from the reachable nodes instead of
# throwing on the first unreachable one). Idempotent; tsx reads the patched source.
patch_solo() {
  local patch="${SCRIPT_DIR}/solo-tolerant-nodeclient.patch"
  [ -f "${patch}" ] || { warn "patch file not found: ${patch}"; return 0; }
  if git -C "${ROOT}" apply --reverse --check "${patch}" 2>/dev/null; then
    sub "solo node-client tolerance patch already applied"
  elif git -C "${ROOT}" apply --check "${patch}" 2>/dev/null; then
    git -C "${ROOT}" apply "${patch}" && ok "applied solo node-client tolerance patch" || warn "solo patch failed to apply"
  else
    warn "solo node-client patch does not apply cleanly (source changed?); skipping"
  fi
  # tsx caches transpiled source; clear it so the patched file is recompiled.
  rm -rf "$(node -e 'process.stdout.write(require("os").tmpdir())' 2>/dev/null)"/tsx-* 2>/dev/null || true
}

phase_cluster() {
  log "PHASE 1/6  kind cluster + Solo init"
  patch_solo
  solo init --dev >/dev/null 2>&1 || true
  # Recreate from scratch: reusing a cluster inherits stale Solo local-config and
  # then fails pre-flight with "Context ... is not valid for cluster ...".
  if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
    warn "kind cluster ${CLUSTER_NAME} already exists; deleting it for a clean run"
    kind delete cluster -n "${CLUSTER_NAME}" >/dev/null 2>&1 || true
  fi
  local cfg=""; [ -f "${ROOT}/resources/kind-config.yaml" ] && cfg="--config ${ROOT}/resources/kind-config.yaml"
  kind create cluster -n "${CLUSTER_NAME}" --image "${KIND_IMAGE}" ${cfg} || die "kind create cluster failed"
  sleep 10
  kubectl config use-context "${CONTEXT}" >/dev/null 2>&1 || true
  ${KCTL} cluster-info >/dev/null 2>&1 || die "kube context ${CONTEXT} cannot reach the fresh cluster"
  solo init >/dev/null 2>&1 || true
  solo cluster-ref config setup --quiet-mode --dev >/dev/null 2>&1 || true
  solo cluster-ref config connect --cluster-ref "${CLUSTER_REF}" --context "${CONTEXT}" || die "cluster-ref connect failed"
  solo deployment config create --deployment "${DEPLOYMENT}" --namespace "${NAMESPACE}" || die "deployment create failed"
  solo deployment cluster attach --deployment "${DEPLOYMENT}" --cluster-ref "${CLUSTER_REF}" --num-consensus-nodes "${NODES}" \
    || die "deployment cluster attach failed"
  ok "cluster ready (context ${CONTEXT})"
}

phase_deploy() {
  log "PHASE 2/6  deploy ${NODES} consensus nodes + ${NODES} block nodes (1:1), config.version=0"
  local props; props="$(mktemp -t bn-bp-app-props)"
  cat > "${props}" <<'PROPS'
hedera.config.version=0
ledger.id=0x01
netty.mode=TEST
contracts.chainId=298
hedera.recordStream.logPeriod=1
balances.exportPeriodSecs=400
files.maxSizeKb=2048
hedera.recordStream.compressFilesOnCreation=true
balances.compressOnCreation=true
contracts.maxNumWithHapiSigsAccess=0
autoRenew.targetTypes=
nodes.gossipFqdnRestricted=false
hedera.profiles.active=TEST
nodes.updateAccountIdAllowed=true
blockStream.streamMode=BLOCKS
blockStream.writerMode=GRPC
blockStream.buffer.maxBlocks=32
networkAdmin.exportCandidateRoster=true
networkAdmin.diskNetworkExport=ONLY_FREEZE_BLOCK
hedera.realm=0
hedera.shard=0
nodes.webProxyEndpointsEnabled=true
nodes.nodeRewardsEnabled=false
PROPS

  # Route com.swirlds + org.hiero to node stdout too. Solo runs the node under s6,
  # so this lands in /var/log/network-node/current, not `kubectl logs`.
  local log4j2="" tmpl="${ROOT}/resources/templates/log4j2.xml"
  if [ -f "${tmpl}" ]; then
    log4j2="$(mktemp -t bn-bp-log4j2-XXXXXX).xml"
    perl -pe 's#(<Logger name="com\.swirlds"[^>]*>)#$1\n      <AppenderRef ref="Console"/>#; s#(<Logger name="org\.hiero"[^>]*>)#$1\n      <AppenderRef ref="Console"/>#' \
      "${tmpl}" > "${log4j2}"
    sub "log4j2: also routing com.swirlds + org.hiero to node stdout (/var/log/network-node/current)"
  fi

  solo keys consensus generate --gossip-keys --tls-keys --deployment "${DEPLOYMENT}" --node-aliases "${NODE_ALIASES}" \
    || die "key generation failed"
  for n in $(seq 1 "${NODES}"); do   # one block node per consensus node, pinned 1:1
    add_block_node "$n" || die "block node add (node${n}) failed after retries"
  done
  local deploy_args=( --deployment "${DEPLOYMENT}" --pvcs true --node-aliases "${NODE_ALIASES}"
                      --release-tag "${CN_VERSION}" --application-properties "${props}" )
  [ -n "${log4j2}" ] && deploy_args+=( --log4j2-xml "${log4j2}" )
  solo consensus network deploy "${deploy_args[@]}" || die "network deploy failed"
  solo consensus node setup --node-aliases "${NODE_ALIASES}" --deployment "${DEPLOYMENT}" --release-tag "${CN_VERSION}" \
    || die "node setup failed"
  solo consensus node start --deployment "${DEPLOYMENT}" --node-aliases "${NODE_ALIASES}" || die "node start failed"
  rm -f "${props}" "${log4j2}"

  sub "waiting for all ${NODES} nodes to reach ACTIVE ..."
  for n in $(seq 1 "${NODES}"); do
    wait_status "$n" ACTIVE 300 || die "node${n} did not reach ACTIVE"
  done
  print_statuses
  ok "network is ACTIVE at config.version=0"
}

phase_backpressure() {
  log "PHASE 3/6  induce back-pressure on node1 (its block node stops acknowledging)"
  stall_acks on || die "could not install the ack-stall rule"
  sub "stalled node1 -> block-node-1 acks; node1's buffer fills as the network produces blocks"
  sub "generating light load and polling until node1 leaves ACTIVE (typically 2-5 min) ..."
  printf '   '
  # Break only once node1 actually leaves ACTIVE: the saturation log line appears a
  # moment earlier, while node1 is still reachable, and the next phase needs it wedged.
  local deadline=$(( $(date +%s) + 480 )) reached="" s burst=0
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    s="$(node_status 1)"
    if [ "${s}" = "CHECKING" ] || [ "${s}" = "BEHIND" ]; then reached="${s}"; break; fi
    if [ "${burst}" -lt "${LOAD_BURST}" ]; then
      bounded_solo 25 ledger account create --deployment "${DEPLOYMENT}" --hbar-amount 1
      burst=$(( burst + 1 ))
    else
      sleep 8
    fi
    printf '.'
  done
  printf '\n'
  if [ -n "${reached}" ]; then
    log_has 1 "Block buffer is saturated; backpressure is being enabled" \
      && ok "node1 logged buffer saturation; back-pressure enabled"
    ok "node1 is wedged (status: ${reached}) -- the node that would miss an upgrade"
  else
    warn "node1 did not leave ACTIVE within timeout; status: $(node_status 1)"
  fi
}

phase_upgrade_blocked() {
  log "PHASE 4/6  Solo's upgrade cannot run while node1 is wedged (structural limit)"
  # node1 must be genuinely unreachable, else the upgrade gets past the ping and
  # starts a real freeze+restart that hangs on it.
  local s; s="$(node_status 1)"
  if [ "${s}" = "ACTIVE" ] || [ -z "${s}" ]; then
    sub "node1 is ${s:-unknown}; waiting for it to leave ACTIVE before attempting ..."
    wait_any_status 1 180 CHECKING BEHIND >/dev/null
    s="$(node_status 1)"
  fi
  sub "attempting: consensus network upgrade --upgrade-version ${UPGRADE_VERSION} (node1 is ${s}) ..."
  sub "(expected to stall/abort -- the upgrade pings every node, including the wedged one)"

  # Output to a file (a $() pipe would block on orphaned children). An error or a
  # stall both mean it can't complete; only a real success contradicts the limit.
  local outf pid end err_pat done_pat
  outf="$(mktemp -t bn-bp-upg-XXXXXX)"
  err_pat="sdk ping network node: 127\.0\.0\.1:[0-9]+|failed to (refresh|setup) node client|Block Node .* not found"
  done_pat="Successfully upgraded|[Uu]pgrade.*completed|✔ .*[Uu]pgrade.*network"
  ( cd "${ROOT}"; solo consensus network upgrade --deployment "${DEPLOYMENT}" --upgrade-version "${UPGRADE_VERSION}" ) >"${outf}" 2>&1 &
  pid=$!; disown 2>/dev/null || true; end=$(( $(date +%s) + 90 ))
  while kill -0 "${pid}" 2>/dev/null; do
    grep -qiE "${err_pat}" "${outf}" 2>/dev/null && break
    grep -qiE "${done_pat}" "${outf}" 2>/dev/null && break
    [ "$(date +%s)" -ge "${end}" ] && break
    sleep 3
  done
  pkill -f "consensus network upgrade" 2>/dev/null || true
  kill "${pid}" 2>/dev/null || true; pkill -P "${pid}" 2>/dev/null || true

  if grep -qiE "${err_pat}" "${outf}" 2>/dev/null; then
    ok "BLOCKED: upgrade pre-flight aborted on the wedged node"
    grep -iE "sdk ping network node|refresh node client|setup node client|not found in remote" "${outf}" | head -2 | sed 's/^/       /'
  elif grep -qiE "${done_pat}" "${outf}" 2>/dev/null; then
    warn "upgrade reported SUCCESS despite node1 wedged -- unexpected; tail:"
    tail -4 "${outf}" 2>/dev/null | sed 's/^/       /'
  else
    ok "BLOCKED: upgrade could not complete while node1 was wedged (stalled, killed after 90s)"
  fi
  rm -f "${outf}"
  sub "=> the faithful 'one node misses the freeze' flow can't be driven through Solo."
}

phase_restore() {
  log "PHASE 5/6  release the stall so node1 recovers to ACTIVE"
  stall_acks off
  sub "removed the ack-stall rule; node1's block node resumes acknowledging"
  # node1 can flap (reconnect to ACTIVE, then briefly fall behind again under load),
  # so wait for ACTIVE first -- it marks the recovery even if it degrades afterward.
  if wait_status 1 ACTIVE 240; then ok "node1 recovered to ACTIVE"; else warn "node1 did not reach ACTIVE within timeout; status: $(node_status 1)"; fi
  log_has 1 "back pressure will be disabled" && ok "node1 logged back-pressure disabled (buffer drained)"
  print_statuses
}

phase_version_split() {
  log "PHASE 6/6  manufacture the config-version split a missed upgrade produces"
  # node1 stays at config.version=0, the rest go to 1. The version is part of the
  # hashed state, so the split nodes ISS and go to CATASTROPHIC_FAILURE.
  for n in ${SKEW_NODES}; do
    set_cfg_version "$n" set "${NEW_CONFIG_VERSION}"
    sub "node${n} -> hedera.config.version=${NEW_CONFIG_VERSION} (restarting)"
  done
  for n in ${SKEW_NODES}; do wait_ready "$n"; done
  sub "waiting for the version-split nodes to settle ..."
  for n in ${SKEW_NODES}; do wait_status "$n" CATASTROPHIC_FAILURE 120 >/dev/null 2>&1 || true; done
  sleep 10
  print_statuses
  local cat=0; for n in ${SKEW_NODES}; do [ "$(node_status "$n")" = "CATASTROPHIC_FAILURE" ] && cat=$(( cat + 1 )); done
  if [ "${cat}" -gt 0 ]; then
    ok "${cat} node(s) hit a fatal ISS and went to CATASTROPHIC_FAILURE -- the version split is fatal"
    sub "the network cannot return to ACTIVE on its own (Tim's 'can't self-heal')"
  else
    warn "no node reached CATASTROPHIC_FAILURE; inspect statuses above"
  fi
}

phase_recover() {
  log "RECOVER  operator realigns versions and restarts"
  for n in ${SKEW_NODES}; do
    set_cfg_version "$n" clear
    sub "node${n} -> config.version override cleared (restarting)"
  done
  ${KCTL} delete pod network-node1-0 -n "${NAMESPACE}" --wait=false >/dev/null 2>&1 || true
  for n in $(seq 1 "${NODES}"); do wait_ready "$n"; done
  sub "waiting for the realigned network to return to ACTIVE ..."
  local active=0
  for n in $(seq 1 "${NODES}"); do wait_status "$n" ACTIVE 300 >/dev/null 2>&1 && active=$(( active + 1 )); done
  print_statuses
  if [ "${active}" -eq "${NODES}" ]; then
    ok "all ${NODES} nodes returned to ACTIVE once versions were realigned"
  else
    warn "only ${active}/${NODES} nodes returned to ACTIVE"
  fi
}

phase_realfreeze() {
  log "REAL-FREEZE  freeze-upgrade skipping wedged node1, then restart node2/3/4 at v1"
  # node1 is wedged (from back-pressure). Submit the upgrade FREEZE via the healthy
  # nodes, skipping node1's ping. Solo's upgrade zip just bumps hedera.config.version,
  # so the staged upgrade == config.version+1, matching the restart value below.
  sub "submitting: dev-freeze freeze-upgrade --skip-node-alias node1 (tolerant client skips wedged node1) ..."
  local outf pid end; outf="$(mktemp -t bn-bp-rf-XXXXXX)"
  ( cd "${ROOT}"; solo consensus dev-freeze freeze-upgrade --skip-node-alias node1 --deployment "${DEPLOYMENT}" ) >"${outf}" 2>&1 &
  pid=$!; disown 2>/dev/null || true; end=$(( $(date +%s) + 360 ))
  while kill -0 "${pid}" 2>/dev/null; do [ "$(date +%s)" -ge "${end}" ] && break; sleep 3; done
  pkill -f "freeze-upgrade" 2>/dev/null || true; kill "${pid}" 2>/dev/null || true; pkill -P "${pid}" 2>/dev/null || true
  grep -qi "skipping unreachable" "${outf}" 2>/dev/null && sub "tolerant client skipped the wedged node (patch active)"

  # Judge the freeze by the real signal: did the healthy nodes reach FREEZE_COMPLETE?
  sub "freeze-upgrade finished; waiting for node2/3/4 to reach FREEZE_COMPLETE ..."
  for n in 2 3 4; do wait_status "$n" FREEZE_COMPLETE 150 >/dev/null 2>&1 || true; done
  local froze=0; for n in 2 3 4; do [ "$(node_status "$n")" = "FREEZE_COMPLETE" ] && froze=$(( froze + 1 )); done
  if [ "${froze}" -gt 0 ]; then
    ok "${froze}/3 healthy nodes reached FREEZE_COMPLETE -- real freeze submitted via the tolerant client"
  else
    warn "node2/3/4 did not reach FREEZE_COMPLETE; freeze-upgrade tail:"; tail -8 "${outf}" 2>/dev/null | sed 's/^/     /'
  fi
  rm -f "${outf}"
  print_statuses

  # Restart node2/3/4 at config.version=1 from the freeze state (clean boundary, no
  # replay across it). node1 missed the freeze and stays at 0.
  sub "restarting node2/3/4 at hedera.config.version=1 from the freeze state ..."
  for n in 2 3 4; do set_cfg_version "$n" set 1; sub "node${n} -> config.version=1 (restart)"; done
  for n in 2 3 4; do wait_ready "$n"; done
  sub "waiting for node2/3/4 to settle (ACTIVE = clean upgrade; CATASTROPHIC = ISS) ..."
  for n in 2 3 4; do wait_any_status "$n" 150 ACTIVE CATASTROPHIC_FAILURE >/dev/null 2>&1 || true; done
  sleep 10
  print_statuses
  local act=0 cat=0 s
  for n in 2 3 4; do s="$(node_status "$n")"; [ "$s" = "ACTIVE" ] && act=$(( act + 1 )); [ "$s" = "CATASTROPHIC_FAILURE" ] && cat=$(( cat + 1 )); done
  if [ "${act}" -eq 3 ]; then
    ok "node2/3/4 came up CLEAN ACTIVE at config.version=1 -- the freeze boundary worked (no replay-ISS)"
    sub "now node1(v0, missed the freeze) vs node2/3/4(v1): node1=$(node_status 1)"
  elif [ "${cat}" -gt 0 ]; then
    warn "node2/3/4 hit ISS/CATASTROPHIC even with the freeze boundary (${cat}/3) -- restart-from-freeze is NOT clean"
  else
    warn "inconclusive node2/3/4 states -- inspect above"
  fi
}

verdict() {
  log "FINAL STATE"
  print_statuses
  sub ""
  sub "teardown: ./reproduce.sh teardown"
}

case "${1:-}" in
  teardown) kind delete cluster -n "${CLUSTER_NAME}"; exit 0 ;;
  recover|"") : ;;
  *) echo "usage: $(basename "$0") [recover|teardown]" >&2; exit 2 ;;
esac

need docker; need kind; need kubectl; need perl; need node
[ -n "${CN_VERSION}" ] || die "could not resolve CN version from ${ROOT}/version-test.ts"

# Refuse concurrent runs: two Solo processes corrupt each other's kube context.
LOCKFILE="/tmp/reproduce-${CLUSTER_NAME}.lock"
if [ -f "${LOCKFILE}" ] && kill -0 "$(cat "${LOCKFILE}" 2>/dev/null)" 2>/dev/null; then
  die "another reproduce.sh run is active (pid $(cat "${LOCKFILE}")). Wait for it or kill it, then retry."
fi
echo $$ > "${LOCKFILE}"
trap 'monitor_stop 2>/dev/null; rm -f "${LOCKFILE}"' EXIT

if [ "${1:-}" = "recover" ]; then
  monitor_start
  phase_recover
  monitor_stop
  exit 0
fi

log "Scenario configuration"
sub "cluster=${CLUSTER_NAME}  namespace=${NAMESPACE}  deployment=${DEPLOYMENT}"
sub "consensus=${CN_VERSION}  block-node=${BN_VERSION}  upgrade-target=${UPGRADE_VERSION}"
sub "solo invocation mode: ${SOLO_MODE}"

phase_cluster
phase_deploy
monitor_start
phase_backpressure
phase_realfreeze
monitor_stop
verdict
