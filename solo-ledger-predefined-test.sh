#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Random node lifecycle stress test for s6-overlay image validation.
# Randomly mixes 10 operations (start / stop / restart / refresh / freeze / ledger-create)
# while keeping the sequence always valid for the current node state.
#
# Usage:  bash solo-ledger-predefined-test.sh [SEED]
#   SEED  Optional integer seed for the random sequence (default: current UTC epoch seconds).
#         Pass the same seed to reproduce an identical run.
#
# State machine:
#   started → stop          → stopped
#   started → freeze        → frozen        (consensus network freeze)
#   started → restart       → started       (stop + start, exercises s6-rc cycle)
#   started → refresh       → started       (stop + setup + start via solo refresh)
#   started → ledger_create → started       (ledger account create)
#   stopped → start         → started
#   stopped → refresh       → started
#   frozen  → start         → started       (s6-rc -d/-u cycle re-launches JVM)

set -eo pipefail

# ── configuration ──────────────────────────────────────────────────────────────
export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_DEPLOYMENT=solo-deployment
export NODE_ALIASES="node1,node2"

TOTAL_OPS=10
SEED="${1:-$(date -u +%s)}"
echo "Random seed: ${SEED}"

# Simple LCG so the same seed always produces the same sequence
lcg_state="${SEED}"
rand() {
  # Advances global RNG state and stores the next pseudo-random integer in RAND_RESULT.
  # Do not use command substitution with this function or state updates will be lost.
  lcg_state=$(( (1103515245 * lcg_state + 12345) & 0x7fffffff ))
  RAND_RESULT=$(( lcg_state % $1 ))
}

# ── bootstrap ──────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo " BOOTSTRAP"
echo "══════════════════════════════════════════════════════════════"

kind delete cluster --name "${SOLO_CLUSTER_NAME}" >/dev/null 2>&1 || true
kind create cluster -n "${SOLO_CLUSTER_NAME}"
rm -f "${HOME}/.solo/local-config.yaml"
rm -rf "${HOME}/.solo/cache"/*

npm run solo-test -- init
npm run solo-test -- cluster-ref config connect \
  --cluster-ref "kind-${SOLO_CLUSTER_NAME}" \
  --context "kind-${SOLO_CLUSTER_NAME}"
npm run solo-test -- deployment config create \
  -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- deployment cluster attach \
  --deployment "${SOLO_DEPLOYMENT}" \
  --cluster-ref "kind-${SOLO_CLUSTER_NAME}" \
  --num-consensus-nodes 2
npm run solo-test -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
npm run solo-test -- block node add --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- keys consensus generate \
  --gossip-keys --tls-keys \
  --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
npm run solo-test -- consensus network deploy \
  --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
npm run solo-test -- consensus node setup \
  --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
npm run solo-test -- consensus node start \
  --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"

echo ""
echo "Bootstrap complete — nodes are STARTED."

# ── operation implementations ──────────────────────────────────────────────────
STATE="started"   # started | stopped | frozen

op_start() {
  echo ""
  echo "▶ [${STEP}/${TOTAL_OPS}] START  (${STATE} → started)"
  npm run solo-test -- consensus node start \
    --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
  STATE="started"
}

op_stop() {
  echo ""
  echo "▶ [${STEP}/${TOTAL_OPS}] STOP   (${STATE} → stopped)"
  npm run solo-test -- consensus node stop \
    --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
  STATE="stopped"
}

op_freeze() {
  echo ""
  echo "▶ [${STEP}/${TOTAL_OPS}] FREEZE (${STATE} → frozen)"
  npm run solo-test -- consensus network freeze \
    --deployment "${SOLO_DEPLOYMENT}"
  STATE="frozen"
}

op_restart() {
  echo ""
  echo "▶ [${STEP}/${TOTAL_OPS}] RESTART  stop→start  (${STATE} → started)"
  npm run solo-test -- consensus node stop \
    --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
  npm run solo-test -- consensus node start \
    --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
  STATE="started"
}

op_refresh() {
  echo ""
  echo "▶ [${STEP}/${TOTAL_OPS}] REFRESH (${STATE} → started)"
  npm run solo-test -- consensus node refresh \
    --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
  STATE="started"
}

op_ledger_create() {
  echo ""
  echo "▶ [${STEP}/${TOTAL_OPS}] LEDGER CREATE account (${STATE} → started)"
  npm run solo-test -- ledger account create \
    --deployment "${SOLO_DEPLOYMENT}" \
    --hbar-amount 100
  # STATE stays started
}


# ── random operation picker ────────────────────────────────────────────────────
pick_op() {
  case "${STATE}" in
    started)
      # 5 valid ops: stop(0) freeze(1) restart(2) refresh(3) ledger_create(4)
      local choice
      rand 5
      choice="${RAND_RESULT}"
      case "${choice}" in
        0) op_stop ;;
        1) op_freeze ;;
        2) op_restart ;;
        3) op_refresh ;;
        4) op_ledger_create ;;
      esac
      ;;
    stopped)
      # 2 valid ops: start(0) refresh(1)
      local choice
      rand 2
      choice="${RAND_RESULT}"
      case "${choice}" in
        0) op_start ;;
        1) op_refresh ;;
      esac
      ;;
    frozen)
      # 1 valid op: start (s6-rc -d/-u re-launches the JVM)
      op_start
      ;;
  esac
}

# ── main loop ──────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo " Running ${TOTAL_OPS} random operations  (seed=${SEED})"
echo "══════════════════════════════════════════════════════════════"

for STEP in $(seq 1 "${TOTAL_OPS}"); do
  echo ""
  echo "── step ${STEP}/${TOTAL_OPS}  state=${STATE} ──────────────────────────────────────"
  pick_op
done

# ── leave nodes in a healthy state ────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo " All ${TOTAL_OPS} operations complete.  Final state: ${STATE}"
echo "══════════════════════════════════════════════════════════════"

if [ "${STATE}" != "started" ]; then
  echo ""
  echo "▶ [teardown] Bringing nodes back to STARTED"
  npm run solo-test -- consensus node start \
    --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
fi

echo ""
echo "Done. ✓"
