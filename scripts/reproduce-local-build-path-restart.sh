#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $0 <deployment> <namespace> <node-aliases-csv> <local-build-path> [pvcs-enabled]

Examples:
  # Expected to FAIL at local-build-path apply when PVCs are disabled
  $0 my-deployment solo node1,node2,node3 /path/to/hedera-node/data false

  # Expected to PASS and persist custom JARs across restart when PVCs are enabled
  $0 my-deployment solo node1,node2,node3 /path/to/hedera-node/data true

Notes:
  - This script follows the repro flow end-to-end:
    1) consensus network deploy (with --pvcs true|false)
    2) consensus node setup --local-build-path
    3) restart one consensus pod
    4) compare custom JAR signatures before/after restart
  - It assumes deployment/cluster prerequisites are already configured.
USAGE
}

if [[ $# -lt 4 ]]; then
  usage
  exit 1
fi

DEPLOYMENT="$1"
NAMESPACE="$2"
NODE_ALIASES="$3"
LOCAL_BUILD_PATH="$4"
PVCS_ENABLED="${5:-false}"
SOLO_CMD="${SOLO_CMD:-npm run solo-test --}"
TARGET_NODE_ALIAS="${TARGET_NODE_ALIAS:-${NODE_ALIASES%%,*}}"

if [[ ! -d "${LOCAL_BUILD_PATH}" ]]; then
  echo "Local build path does not exist: ${LOCAL_BUILD_PATH}"
  exit 1
fi

if [[ "${PVCS_ENABLED}" != "true" && "${PVCS_ENABLED}" != "false" ]]; then
  echo "pvcs-enabled must be either 'true' or 'false'"
  exit 1
fi

get_node_pod_name() {
  kubectl -n "${NAMESPACE}" get pod -l solo.hedera.com/type=network-node -o name \
    | sed 's#pod/##' \
    | grep "${TARGET_NODE_ALIAS}" \
    | head -n 1
}

capture_signature() {
  local pod_name="$1"

  kubectl -n "${NAMESPACE}" exec "${pod_name}" -c root-container -- bash -lc '
    shopt -s nullglob
    jars=(/opt/hgcapp/services-hedera/HapiApp2.0/data/lib/swirlds-*.jar \
          /opt/hgcapp/services-hedera/HapiApp2.0/data/lib/app-service-*.jar \
          /opt/hgcapp/services-hedera/HapiApp2.0/data/apps/swirlds-*.jar \
          /opt/hgcapp/services-hedera/HapiApp2.0/data/apps/app-service-*.jar)
    if [[ ${#jars[@]} -eq 0 ]]; then
      echo "ERROR:NO_CUSTOM_JARS"
      exit 1
    fi

    sha256sum "${jars[@]}" | sort
  '
}

echo "[1/4] Deploy network with --pvcs ${PVCS_ENABLED}"
${SOLO_CMD} consensus network deploy \
  --deployment "${DEPLOYMENT}" \
  --node-aliases "${NODE_ALIASES}" \
  --pvcs "${PVCS_ENABLED}"

echo "[2/4] Apply custom JARs via --local-build-path"
set +e
${SOLO_CMD} consensus node setup \
  --deployment "${DEPLOYMENT}" \
  --node-aliases "${NODE_ALIASES}" \
  --local-build-path "${LOCAL_BUILD_PATH}"
SETUP_EXIT_CODE=$?
set -e

if [[ "${PVCS_ENABLED}" == "false" ]]; then
  if [[ ${SETUP_EXIT_CODE} -eq 0 ]]; then
    echo "FAIL: expected node setup to fail when PVCs are disabled"
    exit 2
  fi

  echo "PASS: node setup failed as expected when PVCs are disabled"
  exit 0
fi

if [[ ${SETUP_EXIT_CODE} -ne 0 ]]; then
  echo "FAIL: node setup failed unexpectedly with PVCs enabled"
  exit 2
fi

POD_NAME="$(get_node_pod_name)"
if [[ -z "${POD_NAME}" ]]; then
  echo "Unable to find pod for ${TARGET_NODE_ALIAS} in namespace ${NAMESPACE}"
  exit 1
fi

echo "[3/4] Capture JAR signature before restart from pod ${POD_NAME}"
BEFORE_SIGNATURE="$(capture_signature "${POD_NAME}")"

echo "[4/4] Restart pod ${POD_NAME} and compare JAR signatures"
kubectl -n "${NAMESPACE}" delete pod "${POD_NAME}" --wait=true
kubectl -n "${NAMESPACE}" wait --for=condition=Ready "pod/${POD_NAME}" --timeout=180s

AFTER_SIGNATURE="$(capture_signature "${POD_NAME}")"

if [[ "${BEFORE_SIGNATURE}" == "${AFTER_SIGNATURE}" ]]; then
  echo "PASS: custom JARs persisted after restart with PVCs enabled"
  exit 0
fi

echo "FAIL: custom JARs changed after restart with PVCs enabled"
echo "--- BEFORE ---"
echo "${BEFORE_SIGNATURE}"
echo "--- AFTER ---"
echo "${AFTER_SIGNATURE}"
exit 2
