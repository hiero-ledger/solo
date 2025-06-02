#!/bin/bash
set -eo pipefail


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

export CONSENSUS_NODE_VERSION=v0.58.10 #$(grep 'HEDERA_PLATFORM_VERSION' version.ts | sed -E "s/.*'([^']+)';/\1/")
solo network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
solo node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo node states -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo node logs -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
cp ~/.solo/logs/"${SOLO_DEPLOYMENT}"/network-node1-0-state.zip  v0.58.10.zip
rm ~/.solo/logs/"${SOLO_DEPLOYMENT}"/*state.zip

export CONSENSUS_NODE_VERSION=v0.59.5
solo network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q || true
solo node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --state-file v0.58.10.zip
solo account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
solo node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo node states -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q
solo node logs -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
cp ~/.solo/logs/"${SOLO_DEPLOYMENT}"/network-node1-0-state.zip v0.59.5.zip
rm ~/.solo/logs/"${SOLO_DEPLOYMENT}"/*state.zip

export CONSENSUS_NODE_VERSION=v0.60.1
solo network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --pvcs --release-tag "${CONSENSUS_NODE_VERSION}" -q || true
solo node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}" -q
solo node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" -q --state-file v0.59.5.zip
solo account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
solo node logs -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
