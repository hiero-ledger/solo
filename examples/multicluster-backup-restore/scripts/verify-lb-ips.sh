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

check_service_ip() {
  local context="$1"
  local service="$2"
  local expected_ip="$3"
  local current_ip

  current_ip="$(kubectl --context "$context" -n "$NAMESPACE" get svc "$service" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)"
  if [[ -z "$current_ip" ]]; then
    echo "[$CHECK_LABEL] Missing LoadBalancer IP for ${context}/${service} in namespace ${NAMESPACE}" >&2
    return 1
  fi

  if [[ "$current_ip" != "$expected_ip" ]]; then
    echo "[$CHECK_LABEL] MISMATCH ${context}/${service}: expected ${expected_ip}, got ${current_ip}" >&2
    return 1
  fi

  echo "[$CHECK_LABEL] OK ${context}/${service}: ${current_ip}"
}

check_service_ip "kind-solo-e2e-c1" "network-node1-svc" "${KIND_SOLO_E2E_C1_NETWORK_NODE1_SVC}"
check_service_ip "kind-solo-e2e-c2" "network-node2-svc" "${KIND_SOLO_E2E_C2_NETWORK_NODE2_SVC}"

echo "[$CHECK_LABEL] All LoadBalancer IP checks passed."
