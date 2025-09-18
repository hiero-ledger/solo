#!/bin/bash
set -eo pipefail

releaseTag="${1}"
if [[ -z "${releaseTag}" ]]; then
  echo "Usage: $0 <releaseTag>"
  exit 1
fi

# check if yq is installed
if ! command -v yq &> /dev/null
then
    echo "yq could not be found, please install it first"
    exit 1
fi

echo "::group::Prerequisites"
npm install -g @hashgraph/solo@"${releaseTag}" --force
solo --version

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-e2e
export USE_MIRROR_NODE_LEGACY_RELEASE_NAME=true

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*
echo "::endgroup::"

echo "::group::Launch solo using released Solo version ${releaseTag}"

export CONSENSUS_NODE_VERSION=$(grep 'TEST_LOCAL_HEDERA_PLATFORM_VERSION' version-test.ts | sed -E "s/.*'([^']+)';/\1/")
echo "Consensus Node Version: ${CONSENSUS_NODE_VERSION}"
solo init
solo cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
solo deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
solo deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 2
solo node keys --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}"
solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

solo network deploy --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node setup --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node start --deployment "${SOLO_DEPLOYMENT}" -q
solo account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100

solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress --pinger -q --mirror-node-version v0.138.0
solo explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} -q
solo relay deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
echo "::endgroup::"

echo "::group::Verification"
cp ~/.solo/local-config.yaml ./local-config-before.yaml
cat ./local-config-before.yaml
kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data' > remote-config-before.yaml
cat remote-config-before.yaml

# trigger migration
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}"

cp ~/.solo/local-config.yaml ./local-config-after.yaml
cat ./local-config-after.yaml
kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data' > remote-config-after.yaml
cat remote-config-after.yaml

# check local-config-after.yaml should contains 'schemaVersion: 2'
if ! grep -q "schemaVersion: 2" ./local-config-after.yaml; then
  echo "schemaVersion: 2 not found in local-config-after.yaml"
  exit 1
fi

# check remote-config-after.yaml should contains 'schemaVersion: 3'
if ! grep -q "schemaVersion: 3" ./remote-config-after.yaml; then
  echo "schemaVersion: 3 not found in remote-config-after.yaml"
  exit 1
fi
echo "::endgroup::"

echo "::group::Upgrade Solo"
# need to add ingress controller helm repo
npm run solo -- init

# using new solo to redeploy solo deployment chart to new version
npm run solo -- consensus node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo -- consensus network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q
npm run solo -- consensus node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
npm run solo -- consensus node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q

# force mirror importer restart to pick up changes of secretes due to upgrade of solo chart
# even mirror chart version might not change, but the secrets it depends on might have changed
kubectl rollout restart deployment/mirror-importer -n solo-e2e
kubectl rollout restart deployment/mirror-rest -n solo-e2e
kubectl rollout restart deployment/mirror-restjava -n solo-e2e
kubectl rollout restart deployment/mirror-web3 -n solo-e2e
kubectl rollout restart deployment/mirror-grpc -n solo-e2e
kubectl rollout restart deployment/mirror-monitor -n solo-e2e
kubectl rollout restart deployment/mirror-postgres-pgpool -n solo-e2e
kubectl rollout restart deployment/mirror-ingress-controller -n solo-e2e

npm run solo -- relay node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} -q --dev
# force restart relay pod to pick up changes of configMap
kubectl rollout restart deployment/relay-node1-node2 -n solo-e2e

# redeploy mirror node to upgrade to a newer version
npm run solo -- mirror node upgrade --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress --pinger -q --dev
npm run solo -- explorer node upgrade --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --mirrorNamespace ${SOLO_NAMESPACE} -q --dev


# wait a few seconds for the pods to be ready before running transactions against them
sleep 10

# kill existing port-forward process due to restart of relay pods
curl http://127.0.0.1:7546 || true

# find the new pod name then enable port-forwarding to it, do not match anything with "ws" in the name
relayPodName=$(kubectl get pods -n solo-e2e  | grep relay | awk '{print $1}' | grep -v ws)
echo "Relay Pod Name: ${relayPodName}"
kubectl port-forward -n solo-e2e pods/"${relayPodName}" 7546:7546 &
echo "command is kubectl port-forward -n solo-e2e pods/${relayPodName} 7546:7546 &"

# Test transaction can still be sent and processed
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
echo "::endgroup::"

echo "::group::Upgrade Consensus Node"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Check existing port-forward before upgrade consensus node"
ps -ef |grep port-forward
# Upgrade to latest version
# HEDERA_PLATFORM_VERSION is no longer a hardcoded value in version.ts,
export CONSENSUS_NODE_VERSION=$(grep "HEDERA_PLATFORM_VERSION" version.ts | sed -E "s/.*'([^']+)';/\1/")
echo "Upgrade to Consensus Node Version: ${CONSENSUS_NODE_VERSION}"
npm run solo -- consensus network upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --upgrade-version "${CONSENSUS_NODE_VERSION}" -q
npm run solo -- ledger account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
echo "::endgroup::"

echo "::group::Final Verification"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Check existing port-forward before smoke test"
ps -ef |grep port-forward
SKIP_IMPORTER_CHECK=true
.github/workflows/script/solo_smoke_test.sh "${SKIP_IMPORTER_CHECK}"
echo "::endgroup::"

echo "::group::Cleanup"
# uninstall components using current Solo version
npm run solo -- explorer node destroy --deployment "${SOLO_DEPLOYMENT}" --force
npm run solo -- relay node destroy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
npm run solo -- mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force
npm run solo -- consensus node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo -- consensus network destroy --deployment "${SOLO_DEPLOYMENT}" --force
echo "::endgroup::"
