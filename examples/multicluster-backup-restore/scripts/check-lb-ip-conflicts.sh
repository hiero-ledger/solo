#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <expected-ips-env-file> <namespace> <check-label> [warn-only]" >&2
  exit 1
fi

EXPECTED_FILE="$1"
NAMESPACE="$2"
CHECK_LABEL="$3"
MODE="${4:-strict}"

if [[ ! -f "$EXPECTED_FILE" ]]; then
  echo "[$CHECK_LABEL] Expected IP file not found: $EXPECTED_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$EXPECTED_FILE"

check_conflict() {
  local context="$1"
  local target_service="$2"
  local expected_ip="$3"
  local owner_service=""

  owner_service="$(kubectl --context "$context" -n "$NAMESPACE" get svc \
    -o jsonpath='{range .items[*]}{.metadata.name}{"="}{.status.loadBalancer.ingress[0].ip}{"\n"}{end}' \
    | awk -F= -v ip="$expected_ip" '$2==ip {print $1; exit}')"

  if [[ -z "$owner_service" ]]; then
    echo "[$CHECK_LABEL] INFO ${context}/${target_service}: ${expected_ip} currently unassigned"
    return 0
  fi

  if [[ "$owner_service" != "$target_service" ]]; then
    if [[ "$MODE" == "warn-only" ]]; then
      echo "[$CHECK_LABEL] WARN ${context}/${target_service}: expected ${expected_ip} is owned by ${owner_service}" >&2
      return 0
    fi
    echo "[$CHECK_LABEL] CONFLICT ${context}/${target_service}: expected ${expected_ip} is owned by ${owner_service}" >&2
    return 1
  fi

  echo "[$CHECK_LABEL] OK ${context}/${target_service}: ${expected_ip} already owned by target service"
}

check_conflict "kind-solo-e2e-c1" "envoy-proxy-node1-svc" "${KIND_SOLO_E2E_C1_ENVOY_PROXY_NODE1_SVC}"
check_conflict "kind-solo-e2e-c2" "envoy-proxy-node2-svc" "${KIND_SOLO_E2E_C2_ENVOY_PROXY_NODE2_SVC}"
check_conflict "kind-solo-e2e-c1" "haproxy-node1-svc" "${KIND_SOLO_E2E_C1_HAPROXY_NODE1_SVC}"
check_conflict "kind-solo-e2e-c2" "haproxy-node2-svc" "${KIND_SOLO_E2E_C2_HAPROXY_NODE2_SVC}"
check_conflict "kind-solo-e2e-c1" "network-node1-svc" "${KIND_SOLO_E2E_C1_NETWORK_NODE1_SVC}"
check_conflict "kind-solo-e2e-c2" "network-node2-svc" "${KIND_SOLO_E2E_C2_NETWORK_NODE2_SVC}"

echo "[$CHECK_LABEL] IP ownership pre-check passed."
