#!/usr/bin/env bash
#
# Reproduce hiero-consensus-node issue #25468 on Solo (kind):
#   "software upgrade while one consensus node is back-pressured".
#
# The scenario, step by step (issue #25468) -- the phases below map 1:1:
#   1. one CN's block node stops acking   -> that CN falls into CHECKING (back-pressure)
#   2. perform the software upgrade        -> freeze the network
#   3. the other 3 CNs restart on the new config.version
#   4. allow block acks back to the wedged CN
#   5. observe: can the back-pressured node rejoin the upgraded network?
#
# Solo's "upgrade" just bumps hedera.config.version by 1 -- the same mechanism a real
# freeze-upgrade uses. config.version is part of the hashed state, so a node left on
# the old value can no longer agree with the upgraded majority.
#
# Requires the Solo node-client tolerance patch (applied in phase 1): stock Solo aborts
# the upgrade as soon as it cannot reach the wedged node, so the freeze can't run.
#
# Usage: ./reproduce.sh [recover|teardown]
set -uo pipefail

# ------------------------------ configuration -------------------------------
CLUSTER_NAME="bn-backpressure"
CONTEXT="kind-${CLUSTER_NAME}"
CLUSTER_REF="${CONTEXT}"
NAMESPACE="namespace-bn-bp"
DEPLOYMENT="deployment-bn-bp"
NODES=4
NODE_ALIASES="node1,node2,node3,node4"
UPGRADE_NODES="2 3 4"        # these take the upgrade; node1 is the back-pressured straggler
CONFIG_CM="network-node-data-config-cm"   # shared ConfigMap seeding data/config/application.properties (holds config.version)
STATUS_CACHE_DIR="/tmp/bn-bp-status-$$"    # per-run cache of last seen node status (see node_status)
mkdir -p "${STATUS_CACHE_DIR}" 2>/dev/null || true
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

# ---------------------------- solo invocation -------------------------------
solo() {
  case "${SOLO_MODE}" in
    dist)   ( cd "${ROOT}" && node --no-deprecation --no-warnings dist/solo.js "$@" ) ;;
    tsx)    ( cd "${ROOT}" && npm run --silent solo-test -- "$@" ) ;;
    npx)    npx @hashgraph/solo "$@" ;;
    global) command solo "$@" ;;
  esac
}

# ------------------------------ console output ------------------------------
log()  { printf '\n\033[1;36m========== %s ==========\033[0m\n' "$*"; }
sub()  { printf '   %s\n' "$*"; }
ok()   { printf '   \033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '   \033[1;33m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required tool not found: $1"; }

# ------------------------------- node probes --------------------------------
# Status / back-pressure / ISS lines land in files under output/, not pod stdout,
# so we grep those files over `kubectl exec` (no Solo node client involved).
node_exec()      { ${KCTL} exec -n "${NAMESPACE}" "network-node$1-0" -c root-container -- sh -c "$2" 2>/dev/null; }
node_iss_count() { node_exec "$1" "grep -hc 'Invalid State Signature' ${LOG_DIR}/swirlds.log 2>/dev/null" | tr -dc '0-9'; }
log_has()        { node_exec "$1" "grep -rqF '$2' ${LOG_DIR} 2>/dev/null"; }   # single grep, for fast polling

# swirlds.log grows to tens of MB, so grepping the whole file for the status is slow and
# flaky under load. Read a bounded TAIL instead (tail -c seeks to the last few MB -- cheap),
# and cache the last seen status per node. A stuck node logs no new "Now in" transition, so
# if the tail finds none we fall back to the cached value -- still correct, the node hasn't
# moved. "" is returned only when the tail is empty AND nothing was ever cached.
node_status() {
  local n="$1" s i c="${STATUS_CACHE_DIR}/node$1"
  for i in 1 2 3; do
    s="$(node_exec "$n" "tail -c 4000000 ${LOG_DIR}/swirlds.log 2>/dev/null | grep 'Now in' | tail -1" | sed -E 's/.*Now in ([A-Z_]+).*/\1/')"
    [ -n "${s}" ] && { printf '%s' "${s}" > "${c}" 2>/dev/null; printf '%s\n' "${s}"; return 0; }
    sleep 1
  done
  cat "${c}" 2>/dev/null   # fall back to last known status (stuck node logs no new transition)
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

# --------------------------------- waiters ----------------------------------
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

wait_ready() { ${KCTL} wait --for=condition=Ready "pod/network-node$1-0" -n "${NAMESPACE}" --timeout=200s >/dev/null 2>&1; }

# ------------------------------ fault injection -----------------------------
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

# Kill a PID and ALL its descendants, leaf-first. `solo` is npm -> node -> kubectl
# port-forward, so killing only the direct child (pkill -P) orphans the port-forward,
# which then holds ports 30212+ and makes the next solo command hang. Recurse so nothing
# is left behind.
kill_tree() {  # <pid>
  local p="$1" c
  for c in $(pgrep -P "$p" 2>/dev/null); do kill_tree "$c"; done
  kill -9 "$p" 2>/dev/null || true
}

# Kill leftover solo CLI / port-forward processes from a prior aborted run -- they hold
# ports (30212+) and would make this run's solo commands hang. Safe: this run recreates the
# cluster anyway, and the lockfile already prevents a concurrent run of this script.
kill_strays() {
  pkill -9 -f "solo-test.*${DEPLOYMENT}"        2>/dev/null || true
  pkill -9 -f "port-forward.*${NAMESPACE}"      2>/dev/null || true
}

# Best-effort load txn, killed after <timeout>s so a wedged-node retry can't stall the loop.
bounded_solo() {  # <timeout> <solo args...>
  local t="$1"; shift
  ( cd "${ROOT}"; solo "$@" >/dev/null 2>&1 ) &
  local pid=$! end=$(( $(date +%s) + t ))
  while kill -0 "${pid}" 2>/dev/null; do
    if [ "$(date +%s)" -ge "${end}" ]; then
      disown 2>/dev/null || true
      kill_tree "${pid}"
      return 0
    fi
    sleep 2
  done
  wait "${pid}" 2>/dev/null || true
}

# Run a long solo command in the background, give up after <timeout>s, kill the whole
# tree cleanly (disown silences the "Terminated" job message on bash 3.2).
bounded_bg() {  # <timeout> <outfile> <solo args...>
  local t="$1" outf="$2"; shift 2
  ( cd "${ROOT}"; solo "$@" ) >"${outf}" 2>&1 &
  local pid=$! end=$(( $(date +%s) + t ))
  disown 2>/dev/null || true
  while kill -0 "${pid}" 2>/dev/null; do [ "$(date +%s)" -ge "${end}" ] && break; sleep 3; done
  kill_tree "${pid}"
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

# Make Solo's node client tolerate an unreachable node so upgrade/freeze can run while
# one node is wedged (builds the client from the reachable nodes instead of throwing on
# the first unreachable one). Idempotent; clears the tsx cache so the patch takes effect.
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
  rm -rf "$(node -e 'process.stdout.write(require("os").tmpdir())' 2>/dev/null)"/tsx-* 2>/dev/null || true
}

# =================================== phases =================================
phase_cluster() {
  log "PHASE 1/5  kind cluster + Solo init (+ apply Solo tolerance patch)"
  kill_strays   # clear any orphaned solo/port-forward processes from a prior aborted run
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
  log "PHASE 2/5  deploy ${NODES} consensus nodes + ${NODES} block nodes (1:1), config.version=0"
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

# Issue #25468 step 1: node1's block node stops acking -> node1 falls into CHECKING.
phase_backpressure() {
  log "PHASE 3/5  back-pressure node1 (its block node stops acknowledging)"
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
    ok "node1 is wedged (status: ${reached}) -- the node that will miss the upgrade"
  else
    die "node1 did not leave ACTIVE within timeout; status: $(node_status 1)"
  fi
}

# Issue #25468 steps 2-3: upgrade the network while node1 is wedged, then restart node2/3/4
# on the new config.version. freeze-upgrade only submits the FREEZE and is rejected unless
# an upgrade was prepared first, so run prepare-upgrade then freeze-upgrade -- the same pair
# Solo's own upgrade flow runs. Both skip node1 (tolerance patch). The freeze is a clean
# state boundary, so node2/3/4 come up agreeing; node1 stays behind at the old version.
phase_upgrade() {
  log "PHASE 4/5  upgrade: prepare + freeze (skipping node1), restart node2/3/4 at config.version=1"
  local outf t; outf="$(mktemp -t bn-bp-upg-XXXXXX)"

  t=$(date +%s)
  sub "prepare-upgrade --skip-node-alias node1 (stage upgrade zip + record its hash) ..."
  bounded_bg 240 "${outf}" consensus dev-freeze prepare-upgrade --skip-node-alias node1 --deployment "${DEPLOYMENT}"
  grep -qi "skipping unreachable" "${outf}" 2>/dev/null && sub "tolerant client skipped the wedged node (patch active)"
  grep -qiE "Success|prepare" "${outf}" 2>/dev/null \
    || { warn "prepare-upgrade did not report success; tail:"; tail -5 "${outf}" 2>/dev/null | sed 's/^/     /'; }
  sub "  prepare took $(( $(date +%s) - t ))s"

  t=$(date +%s)
  sub "freeze-upgrade --skip-node-alias node1 (submit the freeze) ..."
  bounded_bg 240 "${outf}" consensus dev-freeze freeze-upgrade --skip-node-alias node1 --deployment "${DEPLOYMENT}"
  rm -f "${outf}"
  sub "  freeze submit took $(( $(date +%s) - t ))s"

  # node2/3/4 freeze together at the same consensus time, so gate on node2.
  t=$(date +%s)
  sub "waiting for node2/3/4 to freeze (FREEZE_COMPLETE) ..."
  wait_status 2 FREEZE_COMPLETE 180 >/dev/null 2>&1 || true
  local froze=0; for n in ${UPGRADE_NODES}; do [ "$(node_status "$n")" = "FREEZE_COMPLETE" ] && froze=$(( froze + 1 )); done
  [ "${froze}" -gt 0 ] && ok "${froze}/3 nodes reached FREEZE_COMPLETE ($(( $(date +%s) - t ))s)" \
                        || die "node2/3/4 never froze -- prepare/freeze upgrade did not take (see Solo output above)"
  print_statuses

  # Restart from the freeze boundary at version=1 (no replay across it). node1 missed
  # the freeze, so leaving it at version=0 is exactly the divergence the upgrade creates.
  # All 3 restart in parallel and boot from the same freeze state, so gate ACTIVE on node2.
  t=$(date +%s)
  sub "restarting node2/3/4 at hedera.config.version=1 from the freeze state ..."
  for n in ${UPGRADE_NODES}; do set_cfg_version "$n" set 1; done
  for n in ${UPGRADE_NODES}; do wait_ready "$n"; done
  wait_any_status 2 200 ACTIVE CATASTROPHIC_FAILURE >/dev/null
  sleep 5
  sub "  restart -> settle took $(( $(date +%s) - t ))s"
  print_statuses
  local act=0 s; for n in ${UPGRADE_NODES}; do s="$(node_status "$n")"; [ "$s" = "ACTIVE" ] && act=$(( act + 1 )); done
  [ "${act}" -eq 3 ] && ok "node2/3/4 came up CLEAN ACTIVE at config.version=1 (freeze boundary worked, no replay-ISS)" \
                     || warn "node2/3/4 did not all reach ACTIVE (${act}/3) -- inspect statuses above"
  sub "node1 missed the freeze and stays at config.version=0 (status: $(node_status 1))"
}

# Issue #25468 steps 4-5 + operator heal. Release node1's acks right after the upgrade:
# node2/3/4 are ACTIVE at v1 but node1 stays stuck at v0 -- the config.version gap (not the
# stall) blocks re-entry, so it does NOT self-heal. Then the operator heals the cluster by
# realigning node1 to v1.
phase_release() {
  log "PHASE 5/5  release node1's acks; show it can't rejoin, then heal the cluster"
  local before; before="$(node_status 1)"
  sub "node1 before release: ${before:-unknown} (config.version=0); node2/3/4 ACTIVE at config.version=1"
  stall_acks off || warn "could not remove the ack-stall rule"
  sub "removed the ack-stall rule; node1 -> block-node-1 acknowledgements resume, buffer can drain"
  log_has 1 "back pressure will be disabled" && sub "node1 logged back-pressure disabled (buffer draining)"

  # node1 should NOT recover on its own. Give it ~2 min, then show the split.
  sub "watching ~2 min: does node1 rejoin on its own, or stay stuck while node2/3/4 stay ACTIVE? ..."
  wait_any_status 1 120 ACTIVE CATASTROPHIC_FAILURE >/dev/null
  sleep 5
  print_statuses
  local s1; s1="$(node_status 1)"
  if [ "${s1}" = "ACTIVE" ]; then
    ok "node1 returned to ACTIVE on its own -- unexpected for a config.version gap; verify node1's version"
  else
    ok "all nodes ACTIVE except node1 (node1: ${s1:-unreadable} @ config.version=0) -- it does NOT self-heal"
    sub "ANSWER to #25468: releasing the acks cleared the back-pressure, but the config.version gap"
    sub "blocks re-entry. The straggler cannot rejoin on its own -- an operator must realign it."
  fi

  # Operator heals the cluster: realign node1 to the upgraded version and let it rejoin.
  log "HEAL  operator realigns node1 to config.version=1 so it rejoins and the cluster recovers"
  heal_node1
}

# Bring the missed-upgrade straggler (node1) to the upgraded version and let it rejoin.
# No freeze path exists: node1 is version-split, so it can neither process the v1
# FREEZE_UPGRADE (won't reach consensus with the v1 majority) nor reconnect (it'd be handed
# a v1 state it cannot run at v0 -- the mirror of "Cannot downgrade build=1 to build=0").
# Realign it through its CONFIG SOURCE -- the shared data-config ConfigMap that seeds
# application.properties -- not a -D flag: set config.version=1 there, restart node1 so
# init-copier seeds data/config at v1, and node1 reconnects to the v1 majority and catches up.
heal_node1() {
  local cur; cur="$(${KCTL} get configmap "${CONFIG_CM}" -n "${NAMESPACE}" \
    -o jsonpath='{.data.application\.properties}' 2>/dev/null | grep -oE 'hedera\.config\.version=[0-9]+' | head -1)"
  sub "config source ${CONFIG_CM}: ${cur:-<none>} -> hedera.config.version=1"
  local tmp; tmp="$(mktemp -t bn-bp-cm-XXXXXX)"
  ${KCTL} get configmap "${CONFIG_CM}" -n "${NAMESPACE}" -o yaml 2>/dev/null \
    | sed -E 's/hedera\.config\.version=[0-9]+/hedera.config.version=1/' > "${tmp}"
  ${KCTL} apply -f "${tmp}" >/dev/null 2>&1 || ${KCTL} replace -f "${tmp}" >/dev/null 2>&1 \
    || { warn "failed to patch ${CONFIG_CM}"; rm -f "${tmp}"; return 1; }
  rm -f "${tmp}"

  # ConfigMap mounts reach the pod through the kubelet cache, which lags ~60s. If node1 is
  # restarted before the new value lands, init-copier seeds data/config with the OLD version,
  # so node1 boots at v0, reconnects to the v1 network and ISS's (-> CATASTROPHIC). Give the
  # cache time, then restart and judge by STATUS: ACTIVE means it booted v1 and rejoined;
  # CATASTROPHIC means it booted the stale v0 -> wait for the cache and restart again.
  sub "waiting ~75s for the config update to reach node1's kubelet ConfigMap cache ..."
  sleep 75
  local attempt result healed=""
  for attempt in 1 2 3; do
    sub "restart node1 (attempt ${attempt}); it should boot at config.version=1 and rejoin ..."
    ${KCTL} delete pod network-node1-0 -n "${NAMESPACE}" --wait=false >/dev/null 2>&1 || true
    wait_ready 1
    rm -f "${STATUS_CACHE_DIR}/node1" 2>/dev/null   # fresh status for this boot (log truncates on restart)
    result="$(wait_any_status 1 240 ACTIVE CATASTROPHIC_FAILURE)"
    [ "${result}" = "ACTIVE" ] && { healed=1; break; }
    warn "node1 booted on the stale config and hit ISS (cache lag); waiting 40s and restarting"
    sleep 40
  done
  sleep 5
  print_statuses
  if [ -n "${healed}" ]; then
    ok "node1 realigned to config.version=1 and rejoined -- cluster healed, all nodes ACTIVE"
  else
    warn "node1 did not reach ACTIVE after 3 restarts (status: $(node_status 1)) -- inspect node1 swirlds.log"
  fi
}

# Standalone operator heal (same as the heal step folded into phase 5).
phase_recover() {
  log "RECOVER  realign node1's config.version to 1 via its config source, restart, rejoin"
  heal_node1
}

verdict() {
  log "FINAL STATE  (all 4 nodes should be ACTIVE at config.version=1 after the heal)"
  print_statuses
  sub ""
  sub "re-heal:  ./reproduce.sh recover    (re-realign node1 if it didn't rejoin)"
  sub "teardown: ./reproduce.sh teardown"
}

# =================================== main ===================================
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
  die "another run is active (pid $(cat "${LOCKFILE}")). Wait for it or kill it, then retry."
fi
echo $$ > "${LOCKFILE}"
trap 'monitor_stop 2>/dev/null; rm -f "${LOCKFILE}"; rm -rf "${STATUS_CACHE_DIR}" 2>/dev/null' EXIT

if [ "${1:-}" = "recover" ]; then
  monitor_start; phase_recover; monitor_stop; exit 0
fi

log "Scenario configuration"
sub "cluster=${CLUSTER_NAME}  namespace=${NAMESPACE}  deployment=${DEPLOYMENT}"
sub "consensus=${CN_VERSION}  block-node=${BN_VERSION}  upgrade-target=${UPGRADE_VERSION}"
sub "solo invocation mode: ${SOLO_MODE}"

phase_cluster
phase_deploy
monitor_start
phase_backpressure   # step 1: wedge node1
phase_upgrade        # steps 2-3: freeze + restart node2/3/4 at v1
phase_release        # steps 4-5 + heal: release acks, show node1 stuck, then realign it -> rejoin
monitor_stop
verdict
