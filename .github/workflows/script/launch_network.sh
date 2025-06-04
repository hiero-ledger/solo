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

npm install -g @hashgraph/solo@"${releaseTag}" --force
solo --version

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-e2e

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*


echo "Launch solo using released Solo version ${releaseTag}"


solo init
solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
solo node keys --gossip-keys --tls-keys -i node1,node2
solo deployment create -i node1,node2 -n "${SOLO_NAMESPACE}" --context kind-"${SOLO_CLUSTER_NAME}" --email john@doe.com --deployment-clusters kind-"${SOLO_CLUSTER_NAME}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --deployment "${SOLO_DEPLOYMENT}"

export CONSENSUS_NODE_VERSION=v0.58.10
# Use custom settings file for the deployment to avoid too many state saved in disk causing the no space left on device error
solo network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q --settings-txt .github/workflows/support/v58-test/settings.txt
solo node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100


solo mirror-node deploy  --deployment "${SOLO_DEPLOYMENT}"
solo explorer deploy -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
solo relay deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

cp ~/.solo/cache/local-config.yaml ./local-config-before.yaml
cat ./local-config-before.yaml
kubectl get ConfigMap solo-remote-config -n ${SOLO_NAMESPACE} -o yaml | yq '.data' > remote-config-before.yaml
cat remote-config-before.yaml

# must uninstall explorer before migration, because the change of explorer chart name and labels
# make it harder to uninstall or upgrade after migration
 solo explorer destroy --deployment "${SOLO_DEPLOYMENT}" --force

# trigger migration
npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}"

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

# using new solo to redeploy solo deployment chart to new version
npm run solo-test -- node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q --settings-txt .github/workflows/support/v58-test/settings.txt

# must kill the pods to trigger redeployment to pickup changes to new image of root-container
# otherwise the missing of zip/unzip would make the platform extraction on nodes fail
kubectl delete pod network-node1-0 -n solo-e2e
kubectl delete pod network-node2-0 -n solo-e2e

npm run solo-test -- node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
npm run solo-test -- node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q

# redeploy mirror-node to upgrade to a newer version
npm run solo-test -- mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --pinger -q --dev

# redeploy explorer and relay node to upgrade to a newer version
npm run solo-test -- explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --mirrorNamespace solo-e2e -q --dev
npm run solo-test -- relay deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --dev

# wait a few seconds for the pods to be ready before enabling port-forwarding
sleep 10
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/haproxy-node1-svc 50211:50211 > /dev/null 2>&1 &
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/relay-node1-node2-hedera-json-rpc-relay 7546:7546 > /dev/null 2>&1 &
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/mirror-grpc 5600:5600 > /dev/null 2>&1 &
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/hiero-explorer 8080:80 > /dev/null 2>&1 &
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/mirror-rest 5551:80 > /dev/null 2>&1 &

# Test transaction can still be sent and processed
npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100

.github/workflows/script/solo_smoke_test.sh

# uninstall components using current Solo version
#
#npm run solo-test -- explorer destroy --deployment "${SOLO_DEPLOYMENT}" --force
#npm run solo-test -- relay destroy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
#npm run solo-test -- mirror-node destroy --deployment "${SOLO_DEPLOYMENT}" --force
#npm run solo-test -- node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
#npm run solo-test -- network destroy --deployment "${SOLO_DEPLOYMENT}" --force
