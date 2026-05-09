#!/bin/bash
set -eo pipefail

collect_failure_diagnostics() {
  local rc="${1}"

  echo "::group::Failure diagnostics"
  echo "launch_network.sh failed with exit code ${rc}"

  if command -v npm &> /dev/null; then
    echo "Collecting Solo deployment diagnostics for ${SOLO_DEPLOYMENT}..."
    npm run solo -- deployment diagnostics all --deployment "${SOLO_DEPLOYMENT}" -q --dev || true
    echo "Solo diagnostics collection finished. Check ~/.solo/logs for downloaded artifacts."
  else
    echo "npm is not available; skipping Solo diagnostics collection"
  fi

  echo "::endgroup::"
}

on_exit() {
  local rc=$?

  if [[ -n "${RENDERED_KIND_CLUSTER_CONFIG_FILE:-}" && -f "${RENDERED_KIND_CLUSTER_CONFIG_FILE}" ]]; then
    rm -f "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
  fi

  if [[ ${rc} -ne 0 ]]; then
    echo "Test failed, current port forward process: "
    ps -ef | grep port-forward
    collect_failure_diagnostics "${rc}"
  fi

  exit "${rc}"
}

trap on_exit EXIT

# Function to save current service ClusterIPs
save_cluster_ips() {
  local namespace="${1}"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Saving current ClusterIPs..."
  NODE1_IP=$(kubectl get svc -n "${namespace}" network-node1-svc -o jsonpath='{.spec.clusterIP}')
  NODE2_IP=$(kubectl get svc -n "${namespace}" network-node2-svc -o jsonpath='{.spec.clusterIP}')
  echo "  node1: ${NODE1_IP}"
  echo "  node2: ${NODE2_IP}"
}

# Function to restore service ClusterIPs using saved values
restore_cluster_ips() {
  local namespace="${1}"
  local saved_node1_ip="${2}"
  local saved_node2_ip="${3}"

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking if ClusterIPs changed..."
  local current_node1_ip=$(kubectl get svc -n "${namespace}" network-node1-svc -o jsonpath='{.spec.clusterIP}')
  local current_node2_ip=$(kubectl get svc -n "${namespace}" network-node2-svc -o jsonpath='{.spec.clusterIP}')

  if [[ "${saved_node1_ip}" != "${current_node1_ip}" ]] || [[ "${saved_node2_ip}" != "${current_node2_ip}" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ClusterIPs changed! Restoring old IPs..."
    echo "  node1: ${current_node1_ip} -> ${saved_node1_ip}"
    echo "  node2: ${current_node2_ip} -> ${saved_node2_ip}"

    # Save service definitions before deletion
    kubectl get svc -n "${namespace}" network-node1-svc -o yaml > /tmp/node1-svc-original.yaml
    kubectl get svc -n "${namespace}" network-node2-svc -o yaml > /tmp/node2-svc-original.yaml

    # Modify YAML to use preserved ClusterIPs and remove immutable/server-managed fields
    yq eval ".spec.clusterIP = \"${saved_node1_ip}\" | .spec.clusterIPs[0] = \"${saved_node1_ip}\" | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.managedFields, .status)" \
      /tmp/node1-svc-original.yaml > /tmp/node1-svc-patched.yaml

    yq eval ".spec.clusterIP = \"${saved_node2_ip}\" | .spec.clusterIPs[0] = \"${saved_node2_ip}\" | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.managedFields, .status)" \
      /tmp/node2-svc-original.yaml > /tmp/node2-svc-patched.yaml

    # Delete services and recreate with preserved IPs
    kubectl delete svc -n "${namespace}" network-node1-svc network-node2-svc
    kubectl apply -f /tmp/node1-svc-patched.yaml
    kubectl apply -f /tmp/node2-svc-patched.yaml

    echo "$(date '+%Y-%m-%d %H:%M:%S') - Verified restored IPs:"
    kubectl get svc -n "${namespace}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ClusterIPs unchanged, no restoration needed"
  fi
}

# Function to display service IPs
show_service_ips() {
  local namespace="${1}"
  local label="${2}"
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs ${label}:"
  kubectl get svc -n "${namespace}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp
}

fromSoloVersion="${1}"
toConsensusNodeVersion="${2}"
if [[ -z "${fromSoloVersion}" ]]; then
  echo "Usage: $0 <fromSoloVersion> [toConsensusNodeVersion]"
  exit 1
fi

# check if yq is installed
if ! command -v yq &> /dev/null
then
    echo "yq could not be found, please install it first"
    exit 1
fi

echo "::group::Prerequisites"
npm install -g @hashgraph/solo@"${fromSoloVersion}" --force
solo --version

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-e2e
export USE_MIRROR_NODE_LEGACY_RELEASE_NAME=false
export MIRROR_NODE_VERSION_PRIOR_TO_UPGRADE=v0.139.0
export SOLO_LOG_LEVEL=debug
export PREV_BLOCK_VERSION=v0.28.0
export PREV_EXPLORER_VERSION=25.0.0
export PREV_RELAY_VERSION=0.76.0

KIND_CLUSTER_CONFIG_FILE="${KIND_CLUSTER_CONFIG_FILE:-.github/workflows/script/kind-config.yaml}"
KIND_CONFIG_RENDERER=".github/workflows/script/render_kind_config.sh"
RENDERED_KIND_CLUSTER_CONFIG_FILE=""

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
if [[ -f "${KIND_CLUSTER_CONFIG_FILE}" ]]; then
  if [[ -x "${KIND_CONFIG_RENDERER}" && -n "${KIND_DOCKER_REGISTRY_MIRRORS:-}" ]]; then
    RENDERED_KIND_CLUSTER_CONFIG_FILE="$(mktemp -t kind-config-XXXX.yaml)"
    "${KIND_CONFIG_RENDERER}" "${KIND_CLUSTER_CONFIG_FILE}" "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
    echo "Using rendered kind config file: ${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
    kind create cluster -n "${SOLO_CLUSTER_NAME}" --config "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
    rm -f "${RENDERED_KIND_CLUSTER_CONFIG_FILE}"
  else
    echo "Using kind config file: ${KIND_CLUSTER_CONFIG_FILE}"
    kind create cluster -n "${SOLO_CLUSTER_NAME}" --config "${KIND_CLUSTER_CONFIG_FILE}"
  fi
else
  echo "kind config file not found: ${KIND_CLUSTER_CONFIG_FILE}; creating cluster without custom registry mirror config."
  kind create cluster -n "${SOLO_CLUSTER_NAME}"
fi

rm -rf ~/.solo/*
echo "::endgroup::"

echo "::group::Launch solo using released Solo version ${fromSoloVersion}"

if [[ -z "${toConsensusNodeVersion}" ]]; then
  export TO_CONSENSUS_NODE_VERSION=$(grep 'TEST_UPGRADE_TO_VERSION' version-test.ts | sed -E "s/.*'([^']+)';/\1/")
  if [[ -z "${TO_CONSENSUS_NODE_VERSION}" ]]; then
    echo "TO_CONSENSUS_NODE_VERSION is empty, please check version-test.ts for TEST_UPGRADE_TO_VERSION"
    exit 1
  fi
else
  export TO_CONSENSUS_NODE_VERSION="${toConsensusNodeVersion}"
fi

export FROM_CONSENSUS_NODE_VERSION=$(grep 'TEST_UPGRADE_FROM_VERSION' version-test.ts | sed -E "s/.*'([^']+)';/\1/")
if [[ -z "${FROM_CONSENSUS_NODE_VERSION}" ]]; then
  echo "FROM_CONSENSUS_NODE_VERSION is empty, please check version-test.ts for TEST_UPGRADE_FROM_VERSION"
  exit 1
fi

echo "Consensus Node Version (from): ${FROM_CONSENSUS_NODE_VERSION}"
echo "Consensus Node Version (to): ${TO_CONSENSUS_NODE_VERSION}"

solo init --dev


solo cluster-ref config connect --cluster-ref ${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME} --dev
solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" --dev
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --num-consensus-nodes 2 --dev
solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" --dev
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --dev

solo block node add --deployment "${SOLO_DEPLOYMENT}" --chart-version "${PREV_BLOCK_VERSION}"
solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev
solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -q --dev
solo ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100 --dev

solo mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --enable-ingress --pinger -q --mirror-node-version ${MIRROR_NODE_VERSION_PRIOR_TO_UPGRADE} --dev
solo explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --explorer-version ${PREV_EXPLORER_VERSION} -q --dev
solo relay node add -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --relay-release ${PREV_RELAY_VERSION} --dev

echo "::endgroup::"

echo "::group::Verification"
cp ~/.solo/local-config.yaml ./local-config-before.yaml
cat ./local-config-before.yaml
kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data' > remote-config-before.yaml
cat remote-config-before.yaml

# trigger migration
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --dev

cp ~/.solo/local-config.yaml ./local-config-after.yaml
cat ./local-config-after.yaml
kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data' > remote-config-after.yaml
cat remote-config-after.yaml

# check local-config-after.yaml should contains 'schemaVersion: 2'
if ! grep -q "schemaVersion: 2" ./local-config-after.yaml; then
  echo "schemaVersion: 2 not found in local-config-after.yaml"
  exit 1
fi

# check remote-config-after.yaml should contains 'schemaVersion: 7'
if ! grep -q "schemaVersion: 7" ./remote-config-after.yaml; then
  echo "schemaVersion: 7 not found in remote-config-after.yaml"
  exit 1
fi
echo "::endgroup::"

echo "::group::Upgrade Solo"
# need to add ingress controller helm repo
echo "Upgrading with workspace Solo CLI"

npm run solo -- init --dev
# Do not force legacy release-name override when upgrading with current workspace Solo.
# The old released Solo command executed above may have installed either naming scheme.
unset USE_MIRROR_NODE_LEGACY_RELEASE_NAME
# freeze network instead of using "node stop" to make sure the network is stopped elegantly
# need to use old solo to freeze the network since new solo freeze may not be compatible with old consensus node
# s6 container
solo -- consensus network freeze --deployment "${SOLO_DEPLOYMENT}" --dev

# using new solo to redeploy solo deployment chart to new version
show_service_ips "${SOLO_NAMESPACE}" "BEFORE network deploy"
save_cluster_ips "${SOLO_NAMESPACE}"

npm run solo -- consensus network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev

show_service_ips "${SOLO_NAMESPACE}" "AFTER network deploy"
restore_cluster_ips "${SOLO_NAMESPACE}" "${NODE1_IP}" "${NODE2_IP}"

npm run solo -- consensus node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${FROM_CONSENSUS_NODE_VERSION}" -q --dev

show_service_ips "${SOLO_NAMESPACE}" "AFTER node setup"

# force mirror component restarts to pick up secret/config changes due to solo chart upgrade.
# deployment naming varies by chart version (e.g. mirror-* vs mirror-1-*), so discover dynamically.
mirrorComponentDeployments=$(kubectl get deployment -n solo-e2e -o name | grep -E '^deployment.apps/mirror(-[0-9]+)?-(importer|rest|restjava|web3|grpc|monitor|postgres-pgpool)$' || true)
if [[ -z "${mirrorComponentDeployments}" ]]; then
  echo "No mirror component deployments found to restart in namespace solo-e2e"
else
  while IFS= read -r deploymentName; do
    [[ -z "${deploymentName}" ]] && continue
    kubectl rollout restart "${deploymentName}" -n solo-e2e
  done <<< "${mirrorComponentDeployments}"
fi

# mirror ingress controller deployment name can vary by chart version
# (e.g. legacy "mirror-ingress-controller" or suffixed "mirror-ingress-controller-<deployment>").
mirrorIngressDeployments=$(kubectl get deployment -n solo-e2e -o name | grep '^deployment.apps/mirror-ingress-controller' || true)
if [[ -z "${mirrorIngressDeployments}" ]]; then
  echo "No mirror ingress controller deployment found to restart in namespace solo-e2e"
else
  while IFS= read -r deploymentName; do
    [[ -z "${deploymentName}" ]] && continue
    kubectl rollout restart "${deploymentName}" -n solo-e2e
  done <<< "${mirrorIngressDeployments}"
fi
sleep 40;

# restart consensus nodes nodes after mirror nodes are restarted to avoid mirror nodes missing any stream files during restart
echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs BEFORE node start:"
kubectl get svc -n "${SOLO_NAMESPACE}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp

echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking config.txt in pods before start:"
for node in node1 node2; do
  echo "=== network-${node}-0 config.txt ==="
  kubectl exec -n "${SOLO_NAMESPACE}" network-${node}-0 -c root-container -- grep "^address" /opt/hgcapp/services-hedera/HapiApp2.0/.archive/config.txt 2>/dev/null || echo "config.txt not found"
done

npm run solo -- consensus node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev || result=$?

echo "$(date '+%Y-%m-%d %H:%M:%S') - Service IPs AFTER node start:"
kubectl get svc -n "${SOLO_NAMESPACE}" network-node1-svc network-node2-svc -o custom-columns=NAME:.metadata.name,CLUSTER-IP:.spec.clusterIP,CREATED:.metadata.creationTimestamp

echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking config.txt AFTER start (wait 10s for file creation):"
sleep 10
for node in node1 node2; do
  echo "=== network-${node}-0 config.txt after start ==="
  kubectl exec -n "${SOLO_NAMESPACE}" network-${node}-0 -c root-container -- grep "^address" /opt/hgcapp/services-hedera/HapiApp2.0/.archive/config.txt 2>/dev/null || echo "config.txt not found or pod not ready"
done

if [[ $result -ne 0 ]]; then
  echo "Starting consensus nodes failed with exit code $result"
  npm run solo -- deployment diagnostics logs --deployment "${SOLO_DEPLOYMENT}" -q --dev
  exit $result
fi

npm run solo -- relay node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev

# force restart relay pod to pick up changes of configMap
kubectl rollout restart deployment/relay-1 -n solo-e2e
kubectl rollout restart deployment/relay-1-ws -n solo-e2e

# redeploy mirror node to upgrade to a newer version
npm run solo -- mirror node upgrade --deployment "${SOLO_DEPLOYMENT}" --enable-ingress --pinger -q --dev
npm run solo -- explorer node upgrade --deployment "${SOLO_DEPLOYMENT}" --mirrorNamespace ${SOLO_NAMESPACE} -q --dev


# wait a few seconds for the pods to be ready before running transactions against them
sleep 10

# kill existing port-forward process due to restart of mirror ingress controller
curl http://127.0.0.1:38081 || true
# find the new mirror-ingress-controller pod name then enable port-forwarding to it
mirrorPodName=$(kubectl get pods -n solo-e2e  | grep mirror-ingress-controller | awk '{print $1}')
echo "Mirror Ingress Controller Pod Name: ${mirrorPodName}"
kubectl port-forward -n solo-e2e --context kind-solo-e2e pods/"${mirrorPodName}" 38081:80 >/tmp/solo-migration-mirror-port-forward.log 2>&1 &

# Test transaction can still be sent and processed
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
echo "::endgroup::"

echo "::group::Upgrade Consensus Node"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Check existing port-forward before upgrade consensus node"
ps -ef |grep port-forward
echo "Upgrade to Consensus Node Version: ${TO_CONSENSUS_NODE_VERSION}"
npm run solo -- consensus network upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --upgrade-version "${TO_CONSENSUS_NODE_VERSION}" -q --dev
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100 --dev

# block node v0.28.0+ requires consensus node v0.71.x+, so upgrade block node after CN upgrade
npm run solo -- block node upgrade --deployment "${SOLO_DEPLOYMENT}"

# kill existing port-forward process due to restart of relay pods
curl http://127.0.0.1:37546 || true

# find the new pod name then enable port-forwarding to it, do not match anything with "ws" in the name
relayPodName=$(kubectl get pods -n solo-e2e  | grep relay | awk '{print $1}' | grep -v ws)
echo "Relay Pod Name: ${relayPodName}"
kubectl port-forward -n solo-e2e --context kind-solo-e2e pods/"${relayPodName}" 37546:7546 >/tmp/solo-migration-relay-port-forward.log 2>&1 &
echo "command is kubectl port-forward -n solo-e2e pods/${relayPodName} 37546:7546 &"

echo "::endgroup::"

echo "::group::Final Verification"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Check existing port-forward before smoke test"
ps -ef |grep port-forward

# Test deployment config list command
echo "Testing deployment config list without cluster-ref..."
npm run solo -- deployment config list --dev
echo "Testing deployment config list with cluster-ref..."
npm run solo -- deployment config list --cluster-ref ${SOLO_CLUSTER_NAME} --dev

SKIP_IMPORTER_CHECK=true
.github/workflows/script/solo_smoke_test.sh "${SKIP_IMPORTER_CHECK}"
echo "::endgroup::"

echo "::group::Cleanup"
# uninstall components using current Solo version
npm run solo -- explorer node destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
npm run solo -- relay node destroy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --dev
npm run solo -- mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
npm run solo -- consensus node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --dev
npm run solo -- consensus network destroy --deployment "${SOLO_DEPLOYMENT}" --force --dev
echo "::endgroup::"
