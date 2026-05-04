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
  # Use annotation-only approach: setting spec.loadBalancerIP alongside metallb.io/loadBalancerIPs
  # causes MetalLB to reject the service with "can not have both" error.
  kubectl --context "$context" -n "$NAMESPACE" patch svc "$service" --type=merge -p \
    "{\"metadata\":{\"annotations\":{\"metallb.universe.tf/loadBalancerIPs\":\"${expected_ip}\",\"metallb.io/loadBalancerIPs\":\"${expected_ip}\"}}}"
}

unassign_service_ip() {
  local context="$1"
  local service="$2"

  echo "[$CHECK_LABEL] Unassigning requested IP for ${context}/${service}"
  kubectl --context "$context" -n "$NAMESPACE" patch svc "$service" --type=json -p \
    '[{"op":"remove","path":"/metadata/annotations/metallb.universe.tf~1loadBalancerIPs"},{"op":"remove","path":"/metadata/annotations/metallb.io~1loadBalancerIPs"}]' 2>/dev/null || true
  kubectl --context "$context" -n "$NAMESPACE" patch svc "$service" --type=merge -p '{"spec":{"loadBalancerIP":null}}' 2>/dev/null || true
}

check_service_ip() {
  local context="$1"
  local service="$2"
  local expected_ip="$3"
  local current_ip=""

  current_ip="$(kubectl --context "$context" -n "$NAMESPACE" get svc "$service" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  [[ "$current_ip" == "$expected_ip" ]]
}

print_service_ip() {
  local context="$1"
  local service="$2"
  local expected_ip="$3"
  local current_ip=""

  current_ip="$(kubectl --context "$context" -n "$NAMESPACE" get svc "$service" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  if [[ "$current_ip" == "$expected_ip" ]]; then
    echo "[$CHECK_LABEL] Assigned ${context}/${service}: ${expected_ip}"
    return 0
  else
    echo "[$CHECK_LABEL] Failed ${context}/${service}: expected ${expected_ip}, got: ${current_ip:-<none>}" >&2
    return 1
  fi
}

all_ips_correct() {
  check_service_ip "kind-solo-e2e-c1" "envoy-proxy-node1-svc" "${KIND_SOLO_E2E_C1_ENVOY_PROXY_NODE1_SVC}" \
    && check_service_ip "kind-solo-e2e-c2" "envoy-proxy-node2-svc" "${KIND_SOLO_E2E_C2_ENVOY_PROXY_NODE2_SVC}" \
    && check_service_ip "kind-solo-e2e-c1" "haproxy-node1-svc" "${KIND_SOLO_E2E_C1_HAPROXY_NODE1_SVC}" \
    && check_service_ip "kind-solo-e2e-c2" "haproxy-node2-svc" "${KIND_SOLO_E2E_C2_HAPROXY_NODE2_SVC}" \
    && check_service_ip "kind-solo-e2e-c1" "network-node1-svc" "${KIND_SOLO_E2E_C1_NETWORK_NODE1_SVC}" \
    && check_service_ip "kind-solo-e2e-c2" "network-node2-svc" "${KIND_SOLO_E2E_C2_NETWORK_NODE2_SVC}"
}

# Phase 1: clear all existing IP pin annotations and spec.loadBalancerIP.
# This removes stale/wrong requests before we set the correct ones.
unassign_service_ip "kind-solo-e2e-c1" "envoy-proxy-node1-svc"
unassign_service_ip "kind-solo-e2e-c2" "envoy-proxy-node2-svc"
unassign_service_ip "kind-solo-e2e-c1" "haproxy-node1-svc"
unassign_service_ip "kind-solo-e2e-c2" "haproxy-node2-svc"
unassign_service_ip "kind-solo-e2e-c1" "network-node1-svc"
unassign_service_ip "kind-solo-e2e-c2" "network-node2-svc"

# Phase 2: set desired IP annotations immediately (no sleep).
# Using annotation-only approach avoids MetalLB's "can not have both
# metallb.io/loadBalancerIPs and spec.loadBalancerIP" validation error.
# MetalLB's cascading reconcile loop resolves circular IP swaps over
# multiple passes without needing explicit ordering here.
patch_service_ip "kind-solo-e2e-c1" "envoy-proxy-node1-svc" "${KIND_SOLO_E2E_C1_ENVOY_PROXY_NODE1_SVC}"
patch_service_ip "kind-solo-e2e-c2" "envoy-proxy-node2-svc" "${KIND_SOLO_E2E_C2_ENVOY_PROXY_NODE2_SVC}"
patch_service_ip "kind-solo-e2e-c1" "haproxy-node1-svc" "${KIND_SOLO_E2E_C1_HAPROXY_NODE1_SVC}"
patch_service_ip "kind-solo-e2e-c2" "haproxy-node2-svc" "${KIND_SOLO_E2E_C2_HAPROXY_NODE2_SVC}"
patch_service_ip "kind-solo-e2e-c1" "network-node1-svc" "${KIND_SOLO_E2E_C1_NETWORK_NODE1_SVC}"
patch_service_ip "kind-solo-e2e-c2" "network-node2-svc" "${KIND_SOLO_E2E_C2_NETWORK_NODE2_SVC}"

# Wait for MetalLB to converge all annotations to actual IPs.
for _ in {1..45}; do
  if all_ips_correct; then
    break
  fi
  sleep 2
done

# If the IPs are still not all correct, MetalLB may have stale internal
# allocator state (e.g. an IP still tracked as "in use" after a swap).
# Restarting the controller forces it to rebuild allocation state from
# service status fields and re-process all annotation requests.
if ! all_ips_correct; then
  echo "[$CHECK_LABEL] IPs not yet converged — restarting MetalLB controllers to clear stale allocator state..."
  kubectl --context kind-solo-e2e-c1 -n metallb-system rollout restart deployment/metallb-controller 2>/dev/null || true
  kubectl --context kind-solo-e2e-c2 -n metallb-system rollout restart deployment/metallb-controller 2>/dev/null || true
  for _ in {1..30}; do
    if all_ips_correct; then
      break
    fi
    sleep 2
  done
fi

ok=true
print_service_ip "kind-solo-e2e-c1" "envoy-proxy-node1-svc" "${KIND_SOLO_E2E_C1_ENVOY_PROXY_NODE1_SVC}" || ok=false
print_service_ip "kind-solo-e2e-c2" "envoy-proxy-node2-svc" "${KIND_SOLO_E2E_C2_ENVOY_PROXY_NODE2_SVC}" || ok=false
print_service_ip "kind-solo-e2e-c1" "haproxy-node1-svc" "${KIND_SOLO_E2E_C1_HAPROXY_NODE1_SVC}" || ok=false
print_service_ip "kind-solo-e2e-c2" "haproxy-node2-svc" "${KIND_SOLO_E2E_C2_HAPROXY_NODE2_SVC}" || ok=false
print_service_ip "kind-solo-e2e-c1" "network-node1-svc" "${KIND_SOLO_E2E_C1_NETWORK_NODE1_SVC}" || ok=false
print_service_ip "kind-solo-e2e-c2" "network-node2-svc" "${KIND_SOLO_E2E_C2_NETWORK_NODE2_SVC}" || ok=false

if [[ "$ok" != "true" ]]; then
  exit 1
fi

echo "[$CHECK_LABEL] LB IP enforcement complete."
