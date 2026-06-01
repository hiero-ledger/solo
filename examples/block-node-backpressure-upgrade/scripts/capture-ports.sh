#!/usr/bin/env bash
# Capture the addressing of every consensus node and block node, plus the
# authoritative consensus node->port map (gossip/service endpoints from each
# node's genesis-network.json address book). Used to detect whether a software
# upgrade reassigns ports out from under the nodes (the behavior we are hunting).
#
# Usage: capture-ports.sh <label> <namespace> <kube-context>
#   label        - tag for this snapshot, e.g. "baseline" or "post-upgrade"
#   namespace    - kubernetes namespace
#   kube-context - kubectl context (REQUIRED: solo commands switch the current
#                  context, so every kubectl call must be context-explicit)
set -uo pipefail   # NOT -e: a grep no-match must not abort the snapshot

LABEL="${1:?usage: capture-ports.sh <label> <namespace> <kube-context>}"
NAMESPACE="${2:?missing namespace}"
CTX="${3:?missing kube-context}"
OUT="/tmp/bn-bp-ports-${LABEL}.txt"
K="kubectl --context ${CTX} -n ${NAMESPACE}"
GENESIS="/opt/hgcapp/services-hedera/HapiApp2.0/data/config/.archive/genesis-network.json"

{
  echo "# port snapshot: ${LABEL} (namespace ${NAMESPACE}, context ${CTX})"
  echo ""
  echo "## kubernetes service ports"
  echo "# name<TAB>ports<TAB>nodePorts"
  # Per-item jsonpath (nested range can't reach .metadata.name reliably), then
  # filter to the components we care about. '|| true' so a no-match is not fatal.
  ${K} get svc \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.ports[*].port}{"\t"}{.spec.ports[*].nodePort}{"\n"}{end}' 2>/dev/null \
    | grep -E 'network-node|block-node|haproxy|envoy' | sort || true

  echo ""
  echo "## consensus gossip/service endpoints (genesis-network.json address book)"
  # Modern consensus nodes have no config.txt; gossip/service endpoints live in
  # genesis-network.json (IPs are base64-encoded 4-byte IPv4). This is the map
  # the test-client was reassigning on upgrade — the truer signal than Service
  # ports. Every node carries the same network-wide address book, so we collect
  # from all pods and sort -u (collapses identical views; surfaces divergence).
  for pod in $(${K} get pods -o name 2>/dev/null | grep -E 'network-node' | sort); do
    name="${pod##*/}"
    json="$(${K} exec "${name}" -c root-container -- sh -c "cat '${GENESIS}' 2>/dev/null" 2>/dev/null)"
    if [ -z "${json}" ]; then
      echo "${name}: (genesis-network.json not found — verify path in pod)"
      continue
    fi
    echo "${json}" | python3 -c '
import sys, json, base64
def ip(b64):
    try: return ".".join(str(x) for x in base64.b64decode(b64))
    except Exception: return str(b64)
d = json.load(sys.stdin)
for m in d.get("nodeMetadata", []):
    n = m.get("node", {})
    g = (n.get("gossipEndpoint") or [{}])[0]
    s = (n.get("serviceEndpoint") or [{}])[0]
    print("  nodeId={} ({}) gossip={}:{} service={}:{}".format(
        n.get("nodeId"), n.get("description"),
        ip(g.get("ipAddressV4")), g.get("port"),
        ip(s.get("ipAddressV4")), s.get("port")))
' || echo "  ${name}: (failed to parse genesis-network.json)"
  done | sort -u
} > "${OUT}"

# One-line summary; the full snapshot lives in the file (used by diff-ports.sh).
svc=$(grep -cE '^(network-node|block-node|haproxy|envoy)' "${OUT}" 2>/dev/null || echo 0)
eps=$(grep -cE '^  nodeId=' "${OUT}" 2>/dev/null || echo 0)
echo "ports: ${LABEL} captured (${svc} services, ${eps} gossip endpoints) -> ${OUT}"
