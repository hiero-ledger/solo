#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <deployment> <namespace> <node-alias> <local-build-path>"
  echo "Example: $0 my-deployment solo node1 /path/to/hiero-consensus-node/hedera-node/data"
  exit 1
fi

DEPLOYMENT="$1"
NAMESPACE="$2"
NODE_ALIAS="$3"
LOCAL_BUILD_PATH="$4"
SOLO_CMD="${SOLO_CMD:-npm run solo-test --}"

if [[ ! -d "${LOCAL_BUILD_PATH}" ]]; then
  echo "Local build path does not exist: ${LOCAL_BUILD_PATH}"
  exit 1
fi

get_node_pod_name() {
  kubectl -n "${NAMESPACE}" get pod -l solo.hedera.com/type=network-node -o name \
    | sed 's#pod/##' \
    | grep "${NODE_ALIAS}" \
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

echo "Applying custom JARs with --local-build-path"
${SOLO_CMD} consensus node setup \
  --deployment "${DEPLOYMENT}" \
  --node-aliases "${NODE_ALIAS}" \
  --local-build-path "${LOCAL_BUILD_PATH}"

POD_NAME="$(get_node_pod_name)"
if [[ -z "${POD_NAME}" ]]; then
  echo "Unable to find pod for ${NODE_ALIAS} in namespace ${NAMESPACE}"
  exit 1
fi

echo "Capturing JAR signature before restart from pod ${POD_NAME}"
BEFORE_SIGNATURE="$(capture_signature "${POD_NAME}")"

echo "Deleting pod ${POD_NAME}"
kubectl -n "${NAMESPACE}" delete pod "${POD_NAME}" --wait=true
kubectl -n "${NAMESPACE}" wait --for=condition=Ready "pod/${POD_NAME}" --timeout=180s

echo "Capturing JAR signature after restart from pod ${POD_NAME}"
AFTER_SIGNATURE="$(capture_signature "${POD_NAME}")"

if [[ "${BEFORE_SIGNATURE}" == "${AFTER_SIGNATURE}" ]]; then
  echo "PASS: custom JARs persisted after restart."
  exit 0
fi

echo "FAIL: custom JARs changed after restart."
echo "--- BEFORE ---"
echo "${BEFORE_SIGNATURE}"
echo "--- AFTER ---"
echo "${AFTER_SIGNATURE}"
exit 2
