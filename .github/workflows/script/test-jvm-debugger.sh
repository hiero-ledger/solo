#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# test-jvm-debugger.sh — Verify that --debug-node-alias exposes a working JDWP debug port.
#
# Strategy (no IntelliJ / GUI required):
#   1. Bootstrap a 2-node kind cluster with debug enabled on node2 (port 5005, JVM suspend=y).
#   2. Solo sets up kubectl port-forward (localhost:5005 → pod:5005) before showing the
#      interactive "attach debugger" prompt.
#   3. This script auto-confirms the debugger prompt using stdin redirection so it can:
#        a. Wait for localhost:5005 to be reachable.
#        b. Perform a JDWP handshake  ("JDWP-Handshake" → "JDWP-Handshake").
#        c. Send a VirtualMachine.Resume JDWP command so the JVM is no longer suspended.
#   4. Auto-answer "y" to the Solo prompt and wait for all nodes to reach ACTIVE.
#   5. Report PASS / FAIL and clean up.
#
# Requirements:
#   - python3  (for JDWP test; virtually universal)
#   - kind, kubectl, helm, solo (npm run solo-test)
#
# Usage:
#   bash test-jvm-debugger.sh [--skip-bootstrap]
#     --skip-bootstrap   Skip cluster creation and key generation; assume they are already done.

set -eo pipefail

# ── configuration ──────────────────────────────────────────────────────────────
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-deployment
NODE_ALIASES="node1,node2"
DEBUG_NODE=node2
DEBUG_PORT=5005
# Hard stop for the full solo start flow so tests fail boundedly instead of hanging.
NODE_START_TIMEOUT_SECONDS="${NODE_START_TIMEOUT_SECONDS:-420}"
# Separate timeout for JDWP handshake/resume retries.
JDWP_PROBE_WAIT_TIMEOUT_SECONDS="${JDWP_PROBE_WAIT_TIMEOUT_SECONDS:-240}"

SKIP_BOOTSTRAP=false
for arg in "$@"; do
  [[ "$arg" == "--skip-bootstrap" ]] && SKIP_BOOTSTRAP=true
done

# ── terminal colors ────────────────────────────────────────────────────────────
txtyellow='\033[1;33m'
txtgreen='\033[1;32m'
txtred='\033[1;31m'
txtrst='\033[0m'
info() { printf "${txtyellow}[INFO]${txtrst} %s\n" "$1"; }
error() { printf "${txtred}[ERROR]${txtrst} %s\n" "$1"; }
success() { printf "${txtgreen}[SUCCESS]${txtrst} %s\n" "$1"; }

check_deps() {
  local missing=()
  for cmd in python3 kind kubectl; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if (( ${#missing[@]} > 0 )); then
    echo "ERROR: missing required tools: ${missing[*]}" >&2
    exit 1
  fi
}

# Wait for PID to exit with a timeout. Return 0 if process exits successfully, 1 if timeout or error.
wait_for_pid_with_timeout() {
  local pid=$1
  local timeout_seconds=$2
  local description="${3:-process $pid}"
  local deadline=$(($(date +%s) + timeout_seconds))

  while kill -0 "$pid" 2>/dev/null; do
    if (( $(date +%s) >= deadline )); then
      error "Timed out waiting for $description (PID $pid) after ${timeout_seconds}s"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$pid" 2>/dev/null || true
      return 1
    fi
    sleep 1
  done

  # Process has exited, check exit code
  wait "$pid" 2>/dev/null
  local exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    return 0  # Success
  else
    error "$description (PID $pid) failed with exit code $exit_code"
    return 1
  fi
}

cleanup() {
  echo
  info "Cleanup ..."
  [[ -n "${JDWP_PROBE_PID:-}" ]] && kill -TERM "$JDWP_PROBE_PID" 2>/dev/null || true
  [[ -n "${START_PID:-}" ]] && kill -TERM "$START_PID" 2>/dev/null || true
  touch /tmp/solo-jdwp-stop  # Signal probe to exit
  sleep 2
  [[ -n "${JDWP_PROBE_PID:-}" ]] && kill -KILL "$JDWP_PROBE_PID" 2>/dev/null || true
  [[ -n "${START_PID:-}" ]] && kill -KILL "$START_PID" 2>/dev/null || true
  /bin/rm -f /tmp/solo-node-start.log /tmp/solo-jdwp-probe.log /tmp/solo-jdwp-stop /tmp/solo-auto-confirm.sh

  if [[ "$SKIP_BOOTSTRAP" == false ]]; then
    # Thoroughly clean up all Solo configurations
    /bin/rm -rf ~/.solo 2>/dev/null || true
  fi
}

trap cleanup EXIT

# ══════════════════════════════════════════════════════════════════════════════
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"
info "BOOTSTRAP — creating cluster and deploying network"
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"

RESULT=0

check_deps

if [[ "$SKIP_BOOTSTRAP" == false ]]; then
  kind create cluster --name "$SOLO_CLUSTER_NAME" --image kindest/node:v1.34.0 --wait 5m

  npm run solo-test -- init
  npm run solo-test -- cluster-ref config connect --cluster-ref "$SOLO_CLUSTER_NAME" --context "kind-$SOLO_CLUSTER_NAME"
  npm run solo-test -- deployment config create --namespace "$SOLO_NAMESPACE" --deployment "$SOLO_DEPLOYMENT"
  npm run solo-test -- deployment cluster attach --deployment "$SOLO_DEPLOYMENT" --cluster-ref "$SOLO_CLUSTER_NAME" --num-consensus-nodes 2
  npm run solo-test -- cluster-ref config setup -s "$SOLO_CLUSTER_SETUP_NAMESPACE"
  npm run solo-test -- keys consensus generate --deployment "$SOLO_DEPLOYMENT" --gossip-keys --tls-keys -i "$NODE_ALIASES"
  npm run solo-test -- consensus network deploy --deployment "$SOLO_DEPLOYMENT" -i "$NODE_ALIASES" --debug-node-alias "$DEBUG_NODE"
  npm run solo-test -- consensus node setup --deployment "$SOLO_DEPLOYMENT" -i "$NODE_ALIASES"
fi

echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"
info "TEST: --debug-node-alias $DEBUG_NODE  (JDWP port $DEBUG_PORT)"
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"

# ── Step 1: verify JDWP args were applied ──────────────────────────────────────
info "Step 1: Verify pod $DEBUG_NODE carries JDWP JVM arg in Helm values"

# Check if environment variable is visible in the pod's environment:
if kubectl get pod "consensus-$DEBUG_NODE" -n "$SOLO_NAMESPACE" -o jsonpath='{.spec.containers[0].env[*].value}' 2>/dev/null | grep -q "\-agentlib:jdwp="; then
  success "JDWP argument found in pod environment for node $DEBUG_NODE"
else
  info "JDWP arg not visible in pod env at pre-start (may be injected at start time); continuing."
fi

# ── Step 2: start nodes with debugger, auto-confirm the interactive prompt ───
info "Step 2: Starting nodes with --debug-node-alias ${DEBUG_NODE} (auto-confirm)"

# ── Step 3: JDWP setup ──────────────────────────────────────────────────────────
info "Step 3: Starting JDWP probe to handle debug connection"

# Start JDWP probe in background to resume the suspended JVM
# when the debug port becomes available
/bin/rm -f /tmp/solo-jdwp-stop /tmp/solo-node-start.log /tmp/solo-auto-confirm.sh
"$(dirname "$0")/jdwp_tester.py" localhost ${DEBUG_PORT} --timeout ${JDWP_PROBE_WAIT_TIMEOUT_SECONDS} > /tmp/solo-jdwp-probe.log 2>&1 &
JDWP_PROBE_PID=$!

# Use stdin redirection to auto-answer prompts (no expect dependency)
info "Auto-confirming debugger prompt using stdin redirection"

# Create a simple wrapper script to handle the auto-confirmation
cat > /tmp/solo-auto-confirm.sh << 'AUTO_CONFIRM'
#!/bin/bash
printf 'y\ny\ny\ny\ny\n'
sleep 300
AUTO_CONFIRM
chmod +x /tmp/solo-auto-confirm.sh

# Start the node with auto-confirmation
timeout "$NODE_START_TIMEOUT_SECONDS" bash -c "
  /tmp/solo-auto-confirm.sh | npm run solo-test -- consensus node start --deployment ${SOLO_DEPLOYMENT} -i ${NODE_ALIASES} --debug-node-alias ${DEBUG_NODE} --quiet-mode
" > /tmp/solo-node-start.log 2>&1 &
START_PID=$!

wait_for_pid_with_timeout "$START_PID" "$NODE_START_TIMEOUT_SECONDS" "consensus node start flow"
start_result=$?
if [[ "$start_result" -ne 0 ]]; then
  RESULT=1
fi

# Stop the probe loop and wait for it to finish.
touch /tmp/solo-jdwp-stop
if wait_for_pid_with_timeout "$JDWP_PROBE_PID" 30 "JDWP probe shutdown"; then
  :
else
  RESULT=1
fi

# ── Step 4: verify all nodes are running ───────────────────────────────────────
info "Step 4: Verify all nodes are ACTIVE"

for alias in ${NODE_ALIASES//,/ }; do
  if npm run solo-test -- consensus node logs --deployment "$SOLO_DEPLOYMENT" --node-alias "$alias" -n 50 | grep -i "NOW ACTIVE"; then
    success "Node $alias is ACTIVE in logs"
  else
    error "Node $alias is NOT active - check logs"
    RESULT=1
  fi
done

# ── VERDICT ─────────────────────────────────────────────────────────────────────
echo
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"
if [[ "$RESULT" -eq 0 ]]; then
  success "PASS: All verification steps passed"
else
  error "FAIL: One or more verification steps failed"
  if [[ -f /tmp/solo-node-start.log ]]; then
    echo "Node start output:"
    cat /tmp/solo-node-start.log
  fi
  if [[ -f /tmp/solo-jdwp-probe.log ]]; then
    echo "JDWP probe output:"
    cat /tmp/solo-jdwp-probe.log
  fi
fi
echo -e "${txtgreen}══════════════════════════════════════════════════════════════${txtrst}"

exit "$RESULT"