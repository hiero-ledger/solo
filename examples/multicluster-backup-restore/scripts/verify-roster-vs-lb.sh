#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <namespace> <check-label>" >&2
  exit 1
fi

NAMESPACE="$1"
CHECK_LABEL="$2"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

node1_log="$tmp_dir/node1-swirlds.log"
node2_log="$tmp_dir/node2-swirlds.log"

kubectl --context kind-solo-e2e-c1 -n "$NAMESPACE" exec network-node1-0 -c root-container -- \
  sh -lc "cat /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log" > "$node1_log"
kubectl --context kind-solo-e2e-c2 -n "$NAMESPACE" exec network-node2-0 -c root-container -- \
  sh -lc "cat /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log" > "$node2_log"

node1_lb_ip="$(kubectl --context kind-solo-e2e-c1 -n "$NAMESPACE" get svc network-node1-svc -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
node2_lb_ip="$(kubectl --context kind-solo-e2e-c2 -n "$NAMESPACE" get svc network-node2-svc -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"

if [[ -z "$node1_lb_ip" || -z "$node2_lb_ip" ]]; then
  echo "[$CHECK_LABEL] Missing live LoadBalancer IP(s), cannot verify roster." >&2
  exit 1
fi

python3 - <<'PY' "$node1_log" "$node2_log" "$node1_lb_ip" "$node2_lb_ip" "$CHECK_LABEL"
import base64
import re
import sys

node1_log, node2_log, node1_lb_ip, node2_lb_ip, label = sys.argv[1:6]

def ip_to_b64(ip: str) -> str:
    return base64.b64encode(bytes(int(o) for o in ip.split("."))).decode()

def extract_roster_b64(path: str) -> list[str]:
    text = open(path, "r", encoding="utf-8").read()
    start = text.rfind("Current Roster:")
    if start < 0:
        raise RuntimeError(f"No 'Current Roster' block found in {path}")
    block = text[start : start + 12000]
    return re.findall(r'"ipAddressV4":\s*"([^"]+)"', block)

def must_match(name: str, actual: str, expected: str) -> None:
    if actual != expected:
        raise RuntimeError(f"[{label}] MISMATCH {name}: roster={actual} expected={expected}")
    print(f"[{label}] OK {name}: {actual}")

expected_node1_b64 = ip_to_b64(node1_lb_ip)
expected_node2_b64 = ip_to_b64(node2_lb_ip)

node1_ips = extract_roster_b64(node1_log)
node2_ips = extract_roster_b64(node2_log)
if len(node1_ips) < 2 or len(node2_ips) < 2:
    raise RuntimeError(f"[{label}] Could not extract both roster node IPs from swirlds logs.")

must_match("node1-view-node1", node1_ips[0], expected_node1_b64)
must_match("node1-view-node2", node1_ips[1], expected_node2_b64)
must_match("node2-view-node1", node2_ips[0], expected_node1_b64)
must_match("node2-view-node2", node2_ips[1], expected_node2_b64)
print(f"[{label}] Roster-to-LB verification passed.")
PY
