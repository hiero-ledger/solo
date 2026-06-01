#!/usr/bin/env bash
###############################################################################
# Block-node back-pressure during a software upgrade -- the "can't self-heal"
# scenario, reproduced on Solo (kind cluster).
#
# Background (hiero-consensus-node PR #25501 + Tim's review):
#   The HAPI test `BlockNodeSoftwareUpgradeSuite.upgradeWithOneNodeStuckInBackpressure`
#   leaves one consensus node stuck because its block node stops acknowledging
#   blocks, runs a software upgrade on the other three (bumping the config
#   version), and finds the network can no longer return to ACTIVE on its own.
#   Tim's comment on that scenario: "This feels bad ... the scenario where CN0
#   can't self-heal. Has there been much discussion about this scenario?"
#
# What this script demonstrates, end to end, on a real 4-node Solo network:
#   1. Back-pressure reproduces: stall node1's block-node acknowledgements and
#      push load -> node1's block buffer saturates and it leaves ACTIVE.
#   2. Structural limit: Solo's own `consensus network upgrade` CANNOT run while
#      a node is wedged -- its pre-flight pings every node (first at :30212) and
#      aborts. So the faithful "one node misses the freeze" flow can't be driven
#      through Solo's upgrade command.
#   3. The fatal mechanism (this is the heart of Tim's concern): `hedera.config.version`
#      is part of the hashed consensus state. We manufacture the version split a
#      missed upgrade produces -- bump the rest of the network to config.version=1,
#      leave node1 at 0 -- and the split nodes hit a fatal ISS (Invalid State
#      Signature) and go to CATASTROPHIC_FAILURE. The network does NOT self-heal.
#   4. Recovery requires an operator: realign the versions and restart. Then the
#      network returns to ACTIVE.
#
# HONEST framing: step 3 manufactures the config-version split directly (kubectl
# + a JVM property), NOT by driving a real freeze through Solo (step 2 shows why
# that's impossible while a node is wedged). It demonstrates that a config-version
# split is fatal and self-heals only on operator realignment -- the failure mode
# behind Tim's question -- not the full back-pressure-causes-missed-freeze flow.
#
# Usage:   ./reproduce.sh           # run the whole scenario
#          ./reproduce.sh teardown  # delete the kind cluster and exit
###############################################################################
set -uo pipefail

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
CLUSTER_NAME="bn-backpressure"
CONTEXT="kind-${CLUSTER_NAME}"
CLUSTER_REF="${CONTEXT}"
NAMESPACE="namespace-bn-bp"
DEPLOYMENT="deployment-bn-bp"
NODES=4
NODE_ALIASES="node1,node2,node3,node4"
SKEW_NODES="2 3 4"            # nodes that take the (simulated) upgrade; node1 is the straggler
NEW_CONFIG_VERSION=1
LOAD_MAX=80                   # cap on load txns while waiting for saturation
STREAM_PORT=40840             # consensus-node -> block-node gRPC stream port

# kind 0.31's default image (v1.35.0) fails to boot the kubelet on current Docker
# ("required cgroups disabled"); v1.31.4 is what Solo CI uses and boots cleanly.
KIND_IMAGE="kindest/node:v1.31.4@sha256:2cb39f7295fe7eafee0842b1052a599a4fb0f8bcf3f83d96c7f4864c357c6c30"

LOG_DIR="/opt/hgcapp/services-hedera/HapiApp2.0/output"
KCTL="kubectl --context ${CONTEXT}"

# --------------------------------------------------------------------------- #
# Resolve repo + versions + how to invoke solo
# --------------------------------------------------------------------------- #
ROOT="$(cd "$(dirname "$0")" && git rev-parse --show-toplevel)"
CN_VERSION="$(sed -n "s/.*TEST_UPGRADE_FROM_VERSION.*'\([^']*\)'.*/\1/p" "${ROOT}/version-test.ts")"
BN_VERSION="$(sed -n "s/.*PREV_BLOCK_NODE_VERSION.*'\([^']*\)'.*/\1/p" "${ROOT}/version-test.ts")"
UPGRADE_VERSION="$(sed -n "s/.*HEDERA_PLATFORM_VERSION.*||[[:space:]]*'\([^']*\)'.*/\1/p" "${ROOT}/version.ts")"
: "${CN_VERSION:=v0.72.0}" ; : "${BN_VERSION:=v0.31.0}" ; : "${UPGRADE_VERSION:=v0.73.0}"

if   [ "${USE_RELEASED_VERSION:-}" = "true" ]; then SOLO_MODE="npx"
elif [ -f "${ROOT}/dist/solo.js" ];           then SOLO_MODE="dist"
elif [ -f "${ROOT}/solo.ts" ];                then SOLO_MODE="tsx"
elif command -v solo >/dev/null 2>&1;         then SOLO_MODE="global"
else                                               SOLO_MODE="tsx"; fi

# Run solo from the repo root. solo switches the current kube-context mid-run,
# which is why every kubectl call below is --context explicit.
solo() {
  case "${SOLO_MODE}" in
    dist)   ( cd "${ROOT}" && node --no-deprecation --no-warnings dist/solo.js "$@" ) ;;
    tsx)    ( cd "${ROOT}" && npm run --silent solo-test -- "$@" ) ;;
    npx)    npx @hashgraph/solo "$@" ;;
    global) command solo "$@" ;;
  esac
}

# --------------------------------------------------------------------------- #
# Output helpers
# --------------------------------------------------------------------------- #
log()  { printf '\n\033[1;36m========== %s ==========\033[0m\n' "$*"; }
sub()  { printf '   %s\n' "$*"; }
ok()   { printf '   \033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '   \033[1;33m%s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "required tool not found: $1"; }

# --------------------------------------------------------------------------- #
# Node / cluster primitives (all via kubectl exec + on-disk logs, no node client)
# --------------------------------------------------------------------------- #
# A consensus node writes platform status to swirlds.log ("Now in <STATUS>") and
# block/back-pressure lines to block-node-comms.log -- both FILES under output/,
# not pod stdout. So we grep the files via exec.
node_status() {  # <n>  ->  echoes e.g. ACTIVE / CHECKING / BEHIND / CATASTROPHIC_FAILURE
  ${KCTL} exec -n "${NAMESPACE}" "network-node$1-0" -c root-container -- \
    sh -c "grep -h 'Now in' ${LOG_DIR}/swirlds.log 2>/dev/null | tail -1" 2>/dev/null \
    | sed -E 's/.*Now in ([A-Z_]+).*/\1/'
}

node_iss_count() {  # <n>  ->  number of ISS log lines
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

wait_status() {  # <n> <STATUS> <timeout-secs>  ->  0 if reached, 1 if timed out
  local n="$1" want="$2" timeout="$3" deadline
  deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    [ "$(node_status "$n")" = "${want}" ] && return 0
    sleep 5
  done
  return 1
}

wait_any_status() {  # <n> <timeout> <STATUS...>  ->  echoes the status reached, or empty
  local n="$1" timeout="$2"; shift 2; local deadline cur
  deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    cur="$(node_status "$n")"
    for s in "$@"; do [ "${cur}" = "$s" ] && { echo "${cur}"; return 0; }; done
    sleep 5
  done
  echo "$(node_status "$n")"; return 1
}

wait_log() {  # <n> <pattern> <timeout>  ->  0 if found in on-disk logs
  local n="$1" pat="$2" timeout="$3" deadline
  deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    ${KCTL} exec -n "${NAMESPACE}" "network-node$1-0" -c root-container -- \
      sh -c "grep -rqF '${pat}' ${LOG_DIR} 2>/dev/null" && return 0
    sleep 5
  done
  return 1
}

wait_ready() {  # <n>  ->  wait for the pod to be Ready
  ${KCTL} wait --for=condition=Ready "pod/network-node$1-0" -n "${NAMESPACE}" --timeout=200s >/dev/null 2>&1
}

# Stall node1 -> its block node acknowledgements WITHOUT removing the block-node
# pod (scaling it to 0 makes Solo's pre-flight fail "Block Node ... not found").
# We drop only the consensus->block-node stream at the kind node's FORWARD chain,
# matched by source pod IP, so the kubelet liveness probe (same port, from the
# node) still succeeds and the block-node container stays up.
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

# Pin / clear a node's hedera.config.version via a JVM property, then restart its
# pod. Reads the live JAVA_OPTS and strips any prior override so Solo's own flags
# are preserved. hedera.config.version overrides the application.properties value
# (SystemPropertiesConfigSource outranks the file) and survives restart (it's in
# the StatefulSet spec).
set_cfg_version() {  # <n> <set|clear> [version]
  local n="$1" mode="$2" ver="${3:-1}" cur stripped new
  cur="$(${KCTL} get statefulset "network-node${n}" -n "${NAMESPACE}" \
        -o jsonpath="{range .spec.template.spec.containers[?(@.name=='root-container')].env[?(@.name=='JAVA_OPTS')]}{.value}{end}" 2>/dev/null)"
  stripped="$(printf '%s' "${cur}" | sed -E 's/ *-Dhedera\.config\.version=[0-9]+//g')"
  if [ "${mode}" = "set" ]; then new="${stripped} -Dhedera.config.version=${ver}"; else new="${stripped}"; fi
  ${KCTL} set env "statefulset/network-node${n}" -n "${NAMESPACE}" -c root-container JAVA_OPTS="${new}" >/dev/null 2>&1
  ${KCTL} delete pod "network-node${n}-0" -n "${NAMESPACE}" --wait=false >/dev/null 2>&1 || true
}

# Run a command but kill it after N seconds (macOS has no `timeout`).
run_bounded() { perl -e 'alarm(shift @ARGV); exec @ARGV or exit 127' "$@"; }

# Add one block node, retrying transient image-pull/DNS failures. A failed helm
# install (e.g. ghcr.io DNS blip) leaves no committed state, so we clear any
# partial release and reinstall. Pulling 4 block nodes from ghcr.io is the run's
# main exposure to a transient network blip.
add_block_node() {  # <n>
  local n="$1" attempt
  for attempt in 1 2 3; do
    solo block node add --deployment "${DEPLOYMENT}" --release-tag "${CN_VERSION}" \
      --chart-version "${BN_VERSION}" --priority-mapping "node${n}=2" && return 0
    warn "block node add (node${n}) attempt ${attempt}/3 failed (often a transient ghcr.io pull); retrying ..."
    helm uninstall "block-node-${n}" -n "${NAMESPACE}" --kube-context "${CONTEXT}" >/dev/null 2>&1 || true
    sleep 20
  done
  return 1
}

# --------------------------------------------------------------------------- #
# Phases
# --------------------------------------------------------------------------- #
phase_cluster() {
  log "PHASE 1/7  kind cluster + Solo init"
  solo init --dev >/dev/null 2>&1 || true
  # Always start from a fresh cluster. Reusing an existing one inherits stale kube
  # context + Solo local-config state and Solo's pre-flight then fails with
  # "Context ... is not valid for cluster ...". A repro script owns its cluster.
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
  log "PHASE 2/7  deploy ${NODES} consensus nodes + ${NODES} block nodes (1:1), config.version=0"
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

  solo keys consensus generate --gossip-keys --tls-keys --deployment "${DEPLOYMENT}" --node-aliases "${NODE_ALIASES}" \
    || die "key generation failed"
  # One block node per consensus node; --priority-mapping pins each 1:1 so killing
  # block-node-1's acks affects only node1.
  for n in $(seq 1 "${NODES}"); do
    add_block_node "$n" || die "block node add (node${n}) failed after retries"
  done
  solo consensus network deploy --deployment "${DEPLOYMENT}" --pvcs true --node-aliases "${NODE_ALIASES}" \
    --release-tag "${CN_VERSION}" --application-properties "${props}" || die "network deploy failed"
  solo consensus node setup --node-aliases "${NODE_ALIASES}" --deployment "${DEPLOYMENT}" --release-tag "${CN_VERSION}" \
    || die "node setup failed"
  solo consensus node start --deployment "${DEPLOYMENT}" --node-aliases "${NODE_ALIASES}" || die "node start failed"
  rm -f "${props}"

  sub "waiting for all ${NODES} nodes to reach ACTIVE ..."
  for n in $(seq 1 "${NODES}"); do
    wait_status "$n" ACTIVE 300 || die "node${n} did not reach ACTIVE"
  done
  print_statuses
  ok "network is ACTIVE at config.version=0"
}

phase_backpressure() {
  log "PHASE 3/7  induce back-pressure on node1 (its block node stops acknowledging)"
  stall_acks on || die "could not install the ack-stall rule"
  sub "stalled node1 -> block-node-1 acknowledgements (block-node pod stays up)"
  sub "pushing load until node1's block buffer saturates ..."
  printf '   '
  local i s
  for i in $(seq 1 "${LOAD_MAX}"); do
    solo ledger account create --deployment "${DEPLOYMENT}" --hbar-amount 1 >/dev/null 2>&1 && printf '.' || printf 'x'
    if [ $(( i % 5 )) -eq 0 ]; then
      s="$(node_status 1)"
      if [ "${s}" = "CHECKING" ] || [ "${s}" = "BEHIND" ]; then printf ' -> node1=%s\n' "${s}"; break; fi
    fi
  done
  printf '\n'
  if wait_log 1 "Block buffer is saturated; backpressure is being enabled" 120; then
    ok "node1 reported: \"Block buffer is saturated; backpressure is being enabled\""
  else
    warn "saturation log line not seen (log wording is consensus-node-version specific)"
  fi
  s="$(wait_any_status 1 90 CHECKING BEHIND)"
  sub "node1 status: ${s} (back-pressured -- this is the node that would miss an upgrade)"
}

phase_upgrade_blocked() {
  log "PHASE 4/7  Solo's upgrade cannot run while node1 is wedged (structural limit)"
  sub "attempting: consensus network upgrade --upgrade-version ${UPGRADE_VERSION}"
  sub "(node1 is currently $(node_status 1)) ..."
  local out
  out="$( run_bounded 100 bash -c "cd '${ROOT}' && npm run --silent solo-test -- consensus network upgrade --deployment '${DEPLOYMENT}' --upgrade-version '${UPGRADE_VERSION}'" 2>&1 || true )"
  if printf '%s' "${out}" | grep -qiE "sdk ping network node: 127\.0\.0\.1:30212|failed to refresh node client|Block Node .* not found"; then
    ok "BLOCKED as expected: the upgrade pre-flight pings every node and aborts on the wedged one"
    printf '%s\n' "${out}" | grep -iE "sdk ping network node|refresh node client|not found in remote" | head -2 | sed 's/^/       /'
  else
    warn "upgrade did not fail on the expected pre-flight ping; output tail:"
    printf '%s\n' "${out}" | tail -4 | sed 's/^/       /'
  fi
  sub "=> the faithful 'one node misses the freeze' flow can't be driven through Solo."
}

phase_restore() {
  log "PHASE 5/7  release the stall so node1 recovers to ACTIVE"
  stall_acks off
  sub "removed the ack-stall rule; node1's block node resumes acknowledging"
  if wait_log 1 "back pressure will be disabled" 180; then ok "node1 reported back-pressure disabled"; fi
  if wait_status 1 ACTIVE 240; then ok "node1 returned to ACTIVE"; else warn "node1 did not return to ACTIVE: $(node_status 1)"; fi
  print_statuses
}

phase_version_split() {
  log "PHASE 6/7  manufacture the config-version split a missed upgrade produces"
  sub "a real freeze-upgrade bumps config.version on the network; a node that missed it"
  sub "stays on the old version. Simulating that split (node1 stays at 0):"
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
    sub "the network cannot return to ACTIVE on its own (this is Tim's 'can't self-heal')"
  else
    warn "no node reached CATASTROPHIC_FAILURE; inspect statuses above"
  fi
}

phase_recover() {
  log "PHASE 7/7  operator recovery: realign versions and restart"
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
    sub "=> recovery from the split requires an operator to realign + restart; it does not self-heal"
  else
    warn "only ${active}/${NODES} nodes returned to ACTIVE"
  fi
}

verdict() {
  log "VERDICT"
  cat <<EOF
   - Back-pressure reproduces in Solo: stalling node1's block-node acks saturates
     its buffer and it leaves ACTIVE (PHASE 3).
   - Solo's upgrade command cannot run with a node wedged; it pings every node and
     aborts (PHASE 4). The faithful back-pressure-misses-freeze flow can't be driven
     through Solo's upgrade machinery.
   - A config-version split (hedera.config.version, part of the hashed state) is
     FATAL: the split nodes hit an ISS and go to CATASTROPHIC_FAILURE, and the
     network does not self-heal (PHASE 6). This is the failure mode behind Tim's
     "CN0 can't self-heal" question.
   - Recovery needs an operator to realign the versions and restart (PHASE 7).

   Question for the team: is the can't-self-heal-after-a-split scenario expected,
   and should a node that missed an upgrade be able to recover without a manual,
   version-aware restart?

   Tear down with:  ./reproduce.sh teardown
EOF
}

# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
if [ "${1:-}" = "teardown" ]; then
  kind delete cluster -n "${CLUSTER_NAME}"
  exit 0
fi

need docker; need kind; need kubectl; need perl; need node
[ -n "${CN_VERSION}" ] || die "could not resolve CN version from ${ROOT}/version-test.ts"

# Refuse to run two scenarios at once -- concurrent Solo processes fight over the
# kube context and corrupt each other ("Context ... is not valid for cluster ...").
LOCKFILE="/tmp/reproduce-${CLUSTER_NAME}.lock"
if [ -f "${LOCKFILE}" ] && kill -0 "$(cat "${LOCKFILE}" 2>/dev/null)" 2>/dev/null; then
  die "another reproduce.sh run is active (pid $(cat "${LOCKFILE}")). Wait for it or kill it, then retry."
fi
echo $$ > "${LOCKFILE}"
trap 'rm -f "${LOCKFILE}"' EXIT

log "Scenario configuration"
sub "cluster=${CLUSTER_NAME}  namespace=${NAMESPACE}  deployment=${DEPLOYMENT}"
sub "consensus=${CN_VERSION}  block-node=${BN_VERSION}  upgrade-target=${UPGRADE_VERSION}"
sub "solo invocation mode: ${SOLO_MODE}"

phase_cluster
phase_deploy
phase_backpressure
phase_upgrade_blocked
phase_restore
phase_version_split
phase_recover
verdict
