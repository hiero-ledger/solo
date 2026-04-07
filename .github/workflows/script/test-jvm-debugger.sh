#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# test-jvm-debugger.sh — Verify that --debug-node-alias exposes a working JDWP debug port.
#
# Strategy (no IntelliJ / GUI required):
#   1. Bootstrap a 3-node kind cluster with debug enabled on node2 (port 5005, JVM suspend=y).
#   2. Solo sets up kubectl port-forward (localhost:5005 → pod:5005) before showing the
#      interactive "attach debugger" prompt.
#   3. This script uses `expect` to intercept that prompt so it can:
#        a. Wait for localhost:5005 to be reachable.
#        b. Perform a JDWP handshake  ("JDWP-Handshake" → "JDWP-Handshake").
#        c. Send a VirtualMachine.Resume JDWP command so the JVM is no longer suspended.
#   4. Answer "y" to the Solo prompt and wait for all nodes to reach ACTIVE.
#   5. Report PASS / FAIL and clean up.
#
# Requirements:
#   - expect   (brew install expect  /  apt install expect)
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
NODE_ALIASES="node1,node2,node3"
DEBUG_NODE=node2
DEBUG_PORT=5005
# Hard stop for the full solo start flow so tests fail boundedly instead of hanging.
EXPECT_FLOW_TIMEOUT_SECONDS="${EXPECT_FLOW_TIMEOUT_SECONDS:-420}"
# Separate timeout for JDWP handshake/resume retries.
JDWP_PROBE_WAIT_TIMEOUT_SECONDS="${JDWP_PROBE_WAIT_TIMEOUT_SECONDS:-240}"

SKIP_BOOTSTRAP=false
for arg in "$@"; do
  [[ "$arg" == "--skip-bootstrap" ]] && SKIP_BOOTSTRAP=true
done

# ── helpers ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }
info() { echo -e "${YELLOW}[INFO]${NC} $*"; }

RESULT=0

check_deps() {
  local missing=()
  for cmd in expect python3 kind kubectl; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if (( ${#missing[@]} > 0 )); then
    echo "ERROR: missing required tools: ${missing[*]}" >&2
    echo "  brew install expect  (macOS)" >&2
    echo "  apt install expect   (Debian/Ubuntu)" >&2
    exit 1
  fi
}

# Wait up to TIMEOUT seconds for TCP port to accept connections.
wait_for_port() {
  local host="$1" port="$2" timeout="${3:-60}"
  local elapsed=0
  info "Waiting up to ${timeout}s for ${host}:${port} ..."
  while ! python3 -c "
import socket, sys
try:
    s = socket.create_connection(('$host', $port), 2)
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
    sleep 2
    elapsed=$(( elapsed + 2 ))
    if (( elapsed >= timeout )); then
      return 1
    fi
  done
  info "Port ${host}:${port} is reachable after ${elapsed}s"
  return 0
}

wait_for_pid_with_timeout() {
  local pid="$1"
  local timeout_seconds="$2"
  local label="$3"
  local elapsed=0

  while kill -0 "$pid" 2>/dev/null; do
    if (( elapsed >= timeout_seconds )); then
      fail "${label} timed out after ${timeout_seconds}s"
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 1
    elapsed=$(( elapsed + 1 ))
  done

  wait "$pid"
}

# Perform JDWP handshake and send VirtualMachine.Resume.
# Exits 0 on success; non-zero on any failure.
jdwp_test() {
  local host="$1" port="$2"
  python3 - "$host" "$port" <<'PYEOF'
import socket
import struct
import sys

host = sys.argv[1]
port = int(sys.argv[2])

print(f"[JDWP] Connecting to {host}:{port} ...")
try:
    sock = socket.create_connection((host, port), timeout=15)
except OSError as exc:
    print(f"[JDWP] Connection failed: {exc}")
    sys.exit(1)

sock.settimeout(15)

# ── 1. Handshake ──────────────────────────────────────────────────────────────
HANDSHAKE = b"JDWP-Handshake"
sock.sendall(HANDSHAKE)
response = b""
while len(response) < len(HANDSHAKE):
    chunk = sock.recv(len(HANDSHAKE) - len(response))
    if not chunk:
        print("[JDWP] Connection closed before handshake completed")
        sys.exit(1)
    response += chunk

if response != HANDSHAKE:
    print(f"[JDWP] Handshake FAILED: expected {HANDSHAKE!r}, got {response!r}")
    sys.exit(1)

print("[JDWP] Handshake: OK")

# ── 2. VirtualMachine.Resume (CommandSet=1, Command=9) ────────────────────────
# Command packet: length(4) + id(4) + flags(1) + cmdset(1) + cmd(1) = 11 bytes
CMD_LENGTH = 11
CMD_ID     = 1
CMD_FLAGS  = 0x00   # command packet (not a reply)
CMD_SET    = 1      # VirtualMachine
CMD_CMD    = 9      # Resume
packet = struct.pack(">IIBBB", CMD_LENGTH, CMD_ID, CMD_FLAGS, CMD_SET, CMD_CMD)
sock.sendall(packet)

# Reply packet: length(4) + id(4) + flags(1) + error(2) = 11 bytes
reply = b""
while len(reply) < 11:
    chunk = sock.recv(11 - len(reply))
    if not chunk:
        print("[JDWP] Connection closed before receiving Resume reply")
        sys.exit(1)
    reply += chunk

_length, _id, _flags, error_code = struct.unpack(">IIBH", reply)
if error_code != 0:
    print(f"[JDWP] VirtualMachine.Resume failed with JDWP error code {error_code}")
    sys.exit(1)

print("[JDWP] VirtualMachine.Resume: OK  (JVM is now running)")
sock.close()
sys.exit(0)
PYEOF
}

# ── cleanup ────────────────────────────────────────────────────────────────────
cleanup() {
  info "Cleaning up ..."
  rm -f /tmp/solo-debug-expect.log /tmp/solo-node-start.expect /tmp/solo-jdwp-test.sh /tmp/solo-jdwp-probe.log \
    /tmp/solo-jdwp-stop /tmp/solo-node-start.log
  if [[ -n "${JDWP_PROBE_PID:-}" ]]; then
    kill "$JDWP_PROBE_PID" 2>/dev/null || true
  fi
  kind delete cluster -n "$SOLO_CLUSTER_NAME" 2>/dev/null || true
  rm -rf ~/.solo
}

# ── bootstrap ──────────────────────────────────────────────────────────────────
check_deps

if [[ "$SKIP_BOOTSTRAP" == "false" ]]; then
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo " BOOTSTRAP — creating cluster and deploying network"
  echo "══════════════════════════════════════════════════════════════"

  kind delete cluster -n "$SOLO_CLUSTER_NAME" 2>/dev/null || true
  kind create cluster -n "$SOLO_CLUSTER_NAME"
  rm -rf ~/.solo

  npm run solo-test -- init
  npm run solo-test -- cluster-ref config connect \
    --cluster-ref "$SOLO_CLUSTER_NAME" \
    --context "kind-${SOLO_CLUSTER_NAME}"
  npm run solo-test -- deployment config create \
    --namespace "$SOLO_NAMESPACE" \
    --deployment "$SOLO_DEPLOYMENT"
  npm run solo-test -- deployment cluster attach \
    --deployment "$SOLO_DEPLOYMENT" \
    --cluster-ref "$SOLO_CLUSTER_NAME" \
    --num-consensus-nodes 3
  npm run solo-test -- cluster-ref config setup -s "$SOLO_CLUSTER_SETUP_NAMESPACE"
  npm run solo-test -- keys consensus generate \
    --deployment "$SOLO_DEPLOYMENT" \
    --gossip-keys --tls-keys \
    -i "$NODE_ALIASES"
  npm run solo-test -- consensus network deploy \
    --deployment "$SOLO_DEPLOYMENT" \
    -i "$NODE_ALIASES" \
    --debug-node-alias "$DEBUG_NODE"
  npm run solo-test -- consensus node setup \
    --deployment "$SOLO_DEPLOYMENT" \
    -i "$NODE_ALIASES"
fi

# ── test: JVM debug port ───────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
echo " TEST: --debug-node-alias ${DEBUG_NODE}  (JDWP port ${DEBUG_PORT})"
echo "══════════════════════════════════════════════════════════════"

# ── Step 1: verify JDWP args appear in the pod spec ──────────────────────────
info "Step 1: Verify pod ${DEBUG_NODE} carries JDWP JVM arg in Helm values"
POD_NAME=$(kubectl get pod \
  -n "$SOLO_NAMESPACE" \
  -l "solo.hedera.com/type=network-node,solo.hedera.com/node-id=$(echo "$DEBUG_NODE" | tr -dc '0-9')" \
  --no-headers -o custom-columns=":metadata.name" 2>/dev/null | head -1 || true)

# Fallback: match by pod name prefix
if [[ -z "$POD_NAME" ]]; then
  POD_NAME=$(kubectl get pod -n "$SOLO_NAMESPACE" \
    --no-headers -o custom-columns=":metadata.name" 2>/dev/null \
    | grep "^network-${DEBUG_NODE}-" | head -1 || true)
fi

if [[ -z "$POD_NAME" ]]; then
  info "Pod not found yet (nodes not started); skipping pod-spec pre-check."
else
  JDWP_IN_SPEC=$(kubectl get pod -n "$SOLO_NAMESPACE" "$POD_NAME" -o json 2>/dev/null \
    | python3 -c "
import json, sys
spec = json.load(sys.stdin)
containers = spec.get('spec', {}).get('initContainers', []) + spec.get('spec', {}).get('containers', [])
for c in containers:
    for env in c.get('env', []):
        if 'jdwp' in env.get('value', '').lower() or 'jdwp' in env.get('name', '').lower():
            print(env.get('value', ''))
            sys.exit(0)
# Also check configmap-sourced JAVA_OPTS later; just print nothing
sys.exit(0)
" 2>/dev/null || true)

  if [[ -n "$JDWP_IN_SPEC" ]]; then
    pass "JDWP arg found in pod env: $JDWP_IN_SPEC"
  else
    info "JDWP arg not visible in pod env at pre-start (may be injected at start time); continuing."
  fi
fi

# ── Step 2: start nodes with debugger, intercept the interactive prompt ────────
info "Step 2: Starting nodes with --debug-node-alias ${DEBUG_NODE} (uses expect)"

START_CMD="npm run solo-test -- consensus node start \
  --deployment ${SOLO_DEPLOYMENT} \
  -i ${NODE_ALIASES} \
  --debug-node-alias ${DEBUG_NODE} \
  --quiet-mode"

# Build a standalone JDWP probe script to avoid complex nested brace/quote parsing in expect.
cat > /tmp/solo-jdwp-test.sh <<JDWP_SCRIPT
#!/usr/bin/env bash
set -euo pipefail

# Retry handshake+resume in a loop to handle both:
# 1) entrypoint's java -version invocation
# 2) actual ServicesMain JVM startup
# The probe exits when /tmp/solo-jdwp-stop exists or when timeout expires.
deadline=\$(( \$(date +%s) + ${JDWP_PROBE_WAIT_TIMEOUT_SECONDS} ))
success_count=0
while true; do
  if [[ -f /tmp/solo-jdwp-stop ]]; then
    if (( success_count > 0 )); then
      exit 0
    fi
    echo "[JDWP] Stop requested but no successful resume observed" >&2
    exit 1
  fi

  if python3 - localhost ${DEBUG_PORT} <<'PYEOF' 2>/dev/null
import socket, struct, sys
host, port = sys.argv[1], int(sys.argv[2])
HANDSHAKE = b"JDWP-Handshake"
sock = socket.create_connection((host, port), timeout=15)
sock.settimeout(15)
sock.sendall(HANDSHAKE)
resp = b""
while len(resp) < len(HANDSHAKE):
    chunk = sock.recv(len(HANDSHAKE)-len(resp))
    if not chunk: sys.exit(1)
    resp += chunk
if resp != HANDSHAKE:
    print(f"Handshake FAILED: got {resp!r}", file=sys.stderr); sys.exit(1)
print("[JDWP] Handshake OK")
packet = struct.pack(">IIBBB", 11, 1, 0x00, 1, 9)
sock.sendall(packet)
reply = b""
while len(reply) < 11:
    chunk = sock.recv(11-len(reply))
    if not chunk: sys.exit(1)
    reply += chunk
_, _, _, err = struct.unpack(">IIBH", reply)
if err != 0:
    print(f"Resume failed: error {err}", file=sys.stderr); sys.exit(1)
print("[JDWP] VirtualMachine.Resume OK - JVM is running")
sock.close()
PYEOF
  then
    success_count=\$(( success_count + 1 ))
    echo "[JDWP] Resume success count: \${success_count}"
  fi

  now=\$(date +%s)
  if (( now >= deadline )); then
    if (( success_count > 0 )); then
      echo "[JDWP] Timeout reached with \${success_count} successful resume(s)"
      exit 0
    fi
    echo "[JDWP] Timed out after ${JDWP_PROBE_WAIT_TIMEOUT_SECONDS}s without any successful handshake/resume" >&2
    exit 1
  fi
  sleep 2
done
JDWP_SCRIPT

chmod +x /tmp/solo-jdwp-test.sh

# Start JDWP probe first so the debug JVM gets resumed as soon as the
# forwarded debug socket is reachable.
/bin/rm -f /tmp/solo-jdwp-stop /tmp/solo-node-start.log
/tmp/solo-jdwp-test.sh >/tmp/solo-jdwp-probe.log 2>&1 &
JDWP_PROBE_PID=$!

# Run node start in a pty and auto-confirm debugger prompt(s).
cat > /tmp/solo-node-start.expect <<EXPECT_SCRIPT
#!/usr/bin/env expect
set timeout 5
log_file /tmp/solo-node-start.log
spawn bash -c "${START_CMD}"
expect {
  -re "Continue when debugging is complete\\? \\(y/N\\)" {
    send "y\\r"
    exp_continue
  }
  timeout {
    # Keep nudging prompt confirmation even if output rendering changes
    # make prompt text matching unreliable.
    send "y\\r"
    exp_continue
  }
  eof {
    catch wait result
    set ec [lindex \$result 3]
    exit \$ec
  }
}
EXPECT_SCRIPT
chmod +x /tmp/solo-node-start.expect

/tmp/solo-node-start.expect &
START_PID=$!
wait_for_pid_with_timeout "$START_PID" "$EXPECT_FLOW_TIMEOUT_SECONDS" "consensus node start flow"
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

if [[ "$start_result" -eq 0 ]]; then
  pass "Node start with --debug-node-alias completed successfully"
  JDWP_PASSED=true
elif [[ "$start_result" -eq 124 ]]; then
  fail "Node start flow hit watchdog timeout (${EXPECT_FLOW_TIMEOUT_SECONDS}s)"
  JDWP_PASSED=false
  RESULT=1
else
  fail "Node start command failed (see /tmp/solo-node-start.log)"
  JDWP_PASSED=false
  RESULT=1
fi

# ── Step 3: parse expect log for JDWP result lines ───────────────────────────
if [[ -f /tmp/solo-node-start.log ]]; then
  echo ""
  info "Step 3: node start output (tail):"
  tail -n 120 /tmp/solo-node-start.log
fi

if [[ -f /tmp/solo-jdwp-probe.log ]]; then
  echo ""
  info "Step 3b: JDWP probe output:"
  cat /tmp/solo-jdwp-probe.log
fi

# ── Step 4: confirm node2 reached ACTIVE post-resume ──────────────────────────
echo ""
info "Step 4: Confirm ${DEBUG_NODE} reached ACTIVE status"
if kubectl exec -n "$SOLO_NAMESPACE" "network-${DEBUG_NODE}-0" -c root-container -- \
  sh -lc "grep -q 'Now in ACTIVE' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log"; then
  pass "Node ${DEBUG_NODE} reached ACTIVE (confirmed in swirlds.log)"
else
  fail "Node ${DEBUG_NODE} never reached ACTIVE (see recent platform statuses below)"
  kubectl exec -n "$SOLO_NAMESPACE" "network-${DEBUG_NODE}-0" -c root-container -- \
    sh -lc "grep 'Now in ' /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log | tail -n 12" 2>/dev/null || true
  RESULT=1
fi

# ── summary ────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════════"
if [[ "$JDWP_PASSED" == "true" && "$RESULT" -eq 0 ]]; then
  pass "JVM debugger test: ALL CHECKS PASSED"
else
  fail "JVM debugger test: ONE OR MORE CHECKS FAILED"
fi
echo "══════════════════════════════════════════════════════════════"
echo ""

exit "$RESULT"
