#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <expected-ips-env-file> <namespace> <check-label>" >&2
  exit 1
fi

EXPECTED_FILE="$1"
NAMESPACE="$2"
CHECK_LABEL="$3"

if [[ ! -f "$EXPECTED_FILE" ]]; then
  echo "[$CHECK_LABEL] Expected IP file not found: $EXPECTED_FILE" >&2
  echo "[$CHECK_LABEL] Static expected IP file is required: expected-lb-ips.env." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$EXPECTED_FILE"

patch_service_ip() {
  local context="$1"
  local service="$2"
  local expected_ip="$3"
  local current_ip=""

  current_ip="$(kubectl --context "$context" -n "$NAMESPACE" get svc "$service" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  if [[ "$current_ip" == "$expected_ip" ]]; then
    echo "[$CHECK_LABEL] Already pinned ${context}/${service}: ${expected_ip}"
    return 0
  fi

  echo "[$CHECK_LABEL] Patching ${context}/${service} to ${expected_ip} (current: ${current_ip:-<none>})"
  kubectl --context "$context" -n "$NAMESPACE" patch svc "$service" --type=merge -p \
    "{\"metadata\":{\"annotations\":{\"metallb.universe.tf/loadBalancerIPs\":\"${expected_ip}\",\"metallb.io/loadBalancerIPs\":\"${expected_ip}\"}},\"spec\":{\"loadBalancerIP\":\"${expected_ip}\"}}"

  for _ in {1..30}; do
    current_ip="$(kubectl --context "$context" -n "$NAMESPACE" get svc "$service" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
    if [[ "$current_ip" == "$expected_ip" ]]; then
      echo "[$CHECK_LABEL] Assigned ${context}/${service}: ${expected_ip}"
      return 0
    fi
    sleep 2
  done

  echo "[$CHECK_LABEL] Failed to assign ${expected_ip} to ${context}/${service}; got: ${current_ip:-<none>}" >&2
  return 1
}

# Pin envoy/haproxy first so node-service desired IPs are not occupied during reassignment.
patch_service_ip "kind-solo-e2e-c1" "envoy-proxy-node1-svc" "${KIND_SOLO_E2E_C1_ENVOY_PROXY_NODE1_SVC}"
patch_service_ip "kind-solo-e2e-c2" "envoy-proxy-node2-svc" "${KIND_SOLO_E2E_C2_ENVOY_PROXY_NODE2_SVC}"
patch_service_ip "kind-solo-e2e-c1" "haproxy-node1-svc" "${KIND_SOLO_E2E_C1_HAPROXY_NODE1_SVC}"
patch_service_ip "kind-solo-e2e-c2" "haproxy-node2-svc" "${KIND_SOLO_E2E_C2_HAPROXY_NODE2_SVC}"
patch_service_ip "kind-solo-e2e-c1" "network-node1-svc" "${KIND_SOLO_E2E_C1_NETWORK_NODE1_SVC}"
patch_service_ip "kind-solo-e2e-c2" "network-node2-svc" "${KIND_SOLO_E2E_C2_NETWORK_NODE2_SVC}"

echo "[$CHECK_LABEL] LB IP enforcement complete."
