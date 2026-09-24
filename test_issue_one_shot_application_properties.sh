#!/usr/bin/env bash
# Reproduction script for the one-shot application.properties report.
#
# The report is:
#   1. `one-shot single deploy` creates a usable network.
#   2. Re-applying application.properties with `consensus network deploy` leaves
#      the network unable to accept transactions.
#   3. Repeating the same operation with `consensus network upgrade` works.
#
# This script runs both paths from a fresh Kind cluster. It intentionally uses
# the application.properties template from the Solo cache, adds the reported
# contract gas settings, and uses `ledger account create` as the transaction
# health check.
set -euo pipefail

export SOLO_CLUSTER_NAME="${SOLO_CLUSTER_NAME:-solo-application-properties}"
export SOLO_DEPLOYMENT="${SOLO_DEPLOYMENT:-solo-application-properties}"
export SOLO_NAMESPACE="${SOLO_NAMESPACE:-one-shot}"

# v0.75.1 is a published platform package. Solo 0.90.0 itself does not imply
# that a matching platform package exists at builds.hedera.com.
RELEASE_TAG="${RELEASE_TAG:-v0.75.1}"
MINIMAL_SETUP="${MINIMAL_SETUP:-false}"
CLEAR_SOLO_CACHE="${CLEAR_SOLO_CACHE:-false}"
KEEP_CLUSTER="${KEEP_CLUSTER:-false}"
SOLO_CACHE_DIRECTORY="${SOLO_CACHE_DIRECTORY:-${HOME}/.solo/cache}"
SOLO_COMMAND=(npm run solo-test --)

WORK_DIRECTORY="$(mktemp -d)"
cleanup() {
  rm -rf "${WORK_DIRECTORY}"
  if [[ "${KEEP_CLUSTER}" != "true" ]]; then
    kind delete cluster --name "${SOLO_CLUSTER_NAME}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

destroy_kind_clusters() {
  kind delete cluster --name "${SOLO_CLUSTER_NAME}" >/dev/null 2>&1 || true
}

clean_cluster() {
  destroy_kind_clusters

  if [[ "${CLEAR_SOLO_CACHE}" == "true" ]]; then
    rm -rf "${SOLO_CACHE_DIRECTORY}"/*
  fi

  rm -f "${HOME}/.solo/local-config.yaml"
  rm -rf "${HOME}/.solo/one-shot-${SOLO_DEPLOYMENT}"
  kind create cluster --name "${SOLO_CLUSTER_NAME}"
  kubectl label node "${SOLO_CLUSTER_NAME}-control-plane" \
    solo.hashgraph.io/owner=issue-reproduction \
    solo.hashgraph.io/network-id=7 \
    solo.hashgraph.io/role=consensus-node \
    --overwrite

  "${SOLO_COMMAND[@]}" init
}

prepare_application_properties() {
  local cached_properties="${SOLO_CACHE_DIRECTORY}/templates/application.properties"
  local test_properties="${WORK_DIRECTORY}/application.properties"

  if [[ ! -f "${cached_properties}" ]]; then
    echo "Cached application.properties not found: ${cached_properties}" >&2
    echo "Run the script once with CLEAR_SOLO_CACHE=true or set SOLO_CACHE_DIRECTORY." >&2
    return 1
  fi

  cp "${cached_properties}" "${test_properties}"
  cat >>"${test_properties}" <<'EOF'

# Issue reproduction overrides
contracts.maxGasPerTransaction=30000000
contracts.maxGasPerSec=30000000
contracts.maxGasPerSecBackend=30000000
EOF

  printf '%s\n' "${test_properties}"
}

deploy_one_shot() {
  "${SOLO_COMMAND[@]}" one-shot single deploy \
    --deployment "${SOLO_DEPLOYMENT}" \
    --namespace "${SOLO_NAMESPACE}" \
    --minimal-setup "${MINIMAL_SETUP}" \
    --consensus-node-version "${RELEASE_TAG}"
}

submit_transaction() {
  # Account creation submits a real transaction through the consensus node and
  # has the same port-forward/client path affected by the reported problem.
  "${SOLO_COMMAND[@]}" ledger account create \
    --deployment "${SOLO_DEPLOYMENT}" \
    --hbar-amount 1 \
    --create-amount 1
}

dump_consensus_node_state() {
  local pod_name
  pod_name="$(kubectl get pod -n "${SOLO_NAMESPACE}" \
    -l 'solo.hedera.com/node-name=node1,solo.hedera.com/type=network-node' \
    -o jsonpath='{.items[0].metadata.name}')"

  echo "=== Consensus node service state (${1}) ==="
  kubectl exec -n "${SOLO_NAMESPACE}" "${pod_name}" -c root-container -- sh -c \
    'if [ -e /run/s6-rc/servicedirs/network-node/down ]; then
       echo "network-node service: DOWN (down marker exists)";
     else
       echo "network-node service: no down marker";
     fi
     ps -ef | grep -E "[j]ava|[h]edera" || true'
}

run_scenario() {
  local operation="$1"
  local properties_file

  echo
  echo "=== Scenario: one-shot followed by network ${operation} ==="
  clean_cluster
  deploy_one_shot

  echo "=== Baseline transaction ==="
  submit_transaction

  properties_file="$(prepare_application_properties)"
  echo "=== Applying cached application.properties with network ${operation} ==="
  local operation_exit_code=0
  if [[ "${operation}" == "deploy" ]]; then
    if "${SOLO_COMMAND[@]}" consensus network deploy \
        --deployment "${SOLO_DEPLOYMENT}" \
        --application-properties "${properties_file}"; then
      :
    else
      operation_exit_code=$?
    fi
  else
    if "${SOLO_COMMAND[@]}" consensus network upgrade \
        --deployment "${SOLO_DEPLOYMENT}" \
        --application-properties "${properties_file}"; then
      :
    else
      operation_exit_code=$?
    fi
  fi
  if [[ "${operation_exit_code}" -ne 0 ]]; then
    echo "network ${operation} exited with status ${operation_exit_code}" >&2
    if [[ "${operation}" == "upgrade" ]]; then
      return "${operation_exit_code}"
    fi
  fi

  dump_consensus_node_state "after network ${operation}"
  echo "=== Transaction after network ${operation} ==="
  if submit_transaction; then
    echo "RESULT ${operation}: transaction succeeded"
    [[ "${operation}" == "upgrade" ]]
  else
    echo "RESULT ${operation}: transaction failed or timed out"
    [[ "${operation}" == "deploy" ]]
  fi
}

run_scenario deploy
run_scenario upgrade

echo
echo "PASS: network deploy reproduced the transaction failure and network upgrade remained usable."
