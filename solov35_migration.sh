#!/bin/bash
set -eo pipefail


npm install -g @hashgraph/solo@0.35.2 --force
solo --version

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-e2e

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*


solo init
solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
solo node keys --gossip-keys --tls-keys -i node1,node2
solo deployment create -i node1,node2 -n "${SOLO_NAMESPACE}" --context kind-"${SOLO_CLUSTER_NAME}" --email john@doe.com --deployment-clusters kind-"${SOLO_CLUSTER_NAME}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --deployment "${SOLO_DEPLOYMENT}"

echo "********************************************"
echo " Genesis with v0.58.10"
echo "********************************************"

export CONSENSUS_NODE_VERSION=v0.58.10
solo network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
solo node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
kubectl exec -it network-node1-0 -c root-container -n solo-e2e -- ls -ltr /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/

echo "********************************************"
echo " Restart with correct settings file"
echo "********************************************"

# restart with flag for 0.59
#solo network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q  || true
#solo node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
#solo node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
#solo account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
#solo node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
#solo node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
#solo node states -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
#solo node logs -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
##cp ~/.solo/logs/"${SOLO_DEPLOYMENT}"/network-node1-0-state.zip  v0.58.10.zip
#rm ~/.solo/logs/"${SOLO_DEPLOYMENT}"/*state.zip
#kubectl exec -it network-node1-0 -c root-container -n solo-e2e -- ls -ltr /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/

echo "********************************************"
echo " Restart with v0.59.5"
echo "********************************************"

export CONSENSUS_NODE_VERSION=v0.59.5
solo network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q  || true
solo node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
solo node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo node states -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo node logs -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
#cp ~/.solo/logs/"${SOLO_DEPLOYMENT}"/network-node1-0-state.zip v0.59.5.zip
#rm ~/.solo/logs/"${SOLO_DEPLOYMENT}"/*state.zip
kubectl exec -it network-node1-0 -c root-container -n solo-e2e -- ls -ltr /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/

export CONSENSUS_NODE_VERSION=v0.61.7
solo network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q  || true
solo node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100

# trigger migration
npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}"

npm run solo-test -- node freeze --deployment "${SOLO_DEPLOYMENT}" -q

# upgrade solo chart to newer version
npm run solo-test -- network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q
npm run solo-test -- node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
npm run solo-test -- node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}"
