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

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*
echo "::endgroup::"

echo "::group::Launch solo using released Solo version ${releaseTag}"

export CONSENSUS_NODE_VERSION=v0.62.10
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

solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress --pinger -q
solo explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} -q
solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
solo relay deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
echo "::endgroup::"

echo "::group::Verification"
cp ~/.solo/local-config.yaml ./local-config-before.yaml
cat ./local-config-before.yaml
kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data' > remote-config-before.yaml
cat remote-config-before.yaml

# trigger migration
npm run solo -- account create --deployment "${SOLO_DEPLOYMENT}"

cp ~/.solo/local-config.yaml ./local-config-after.yaml
cat ./local-config-after.yaml
kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data' > remote-config-after.yaml
cat remote-config-after.yaml

# check local-config-after.yaml should contains 'schemaVersion: 2'
if ! grep -q "schemaVersion: 2" ./local-config-after.yaml; then
  echo "schemaVersion: 2 not found in local-config-after.yaml"
  exit 1
fi

# check remote-config-after.yaml should contains 'schemaVersion: 1'
if ! grep -q "schemaVersion: 1" ./remote-config-after.yaml; then
  echo "schemaVersion: 1 not found in remote-config-after.yaml"
  exit 1
fi
echo "::endgroup::"

echo "::group::Upgrade Solo"
# need to add ingress controller helm repo
npm run solo -- init

# using new solo to redeploy solo deployment chart to new version
npm run solo -- node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo -- network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q
npm run solo -- node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
npm run solo -- node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q

# redeploy mirror-node to upgrade to a newer version
npm run solo -- mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress --pinger -q --dev

# redeploy explorer and relay node to upgrade to a newer version
npm run solo -- relay deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev
npm run solo -- explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --mirrorNamespace ${SOLO_NAMESPACE} -q --dev

# wait a few seconds for the pods to be ready before running transactions against them
sleep 10

# Test transaction can still be sent and processed
npm run solo -- account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
echo "::endgroup::"

echo "::group::Upgrade Consensus Node"
# Upgrade to latest version
export CONSENSUS_NODE_VERSION=$(grep 'HEDERA_PLATFORM_VERSION' version.ts | sed -E "s/.*'([^']+)';/\1/")
npm run solo -- node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --upgrade-version "${CONSENSUS_NODE_VERSION}" -q
npm run solo -- account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
echo "::endgroup::"

echo "::group::Final Verification"
SKIP_IMPORTER_CHECK=true
.github/workflows/script/solo_smoke_test.sh "${SKIP_IMPORTER_CHECK}"
echo "::endgroup::"

echo "::group::Cleanup"
# uninstall components using current Solo version
npm run solo -- explorer destroy --deployment "${SOLO_DEPLOYMENT}" --force
npm run solo -- relay destroy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo -- mirror-node destroy --deployment "${SOLO_DEPLOYMENT}" --force
npm run solo -- node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo -- network destroy --deployment "${SOLO_DEPLOYMENT}" --force
echo "::endgroup::"
