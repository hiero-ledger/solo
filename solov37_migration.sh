#!/bin/bash
set -eo pipefail


export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-e2e

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*

export CONSENSUS_NODE_VERSION=v0.58.10

npm run solo-test -- init
npm run solo-test -- cluster-ref setup \
  -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
npm run solo-test -- cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}

npm run solo-test -- deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"

npm run solo-test -- deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 2

npm run solo-test -- node keys --gossip-keys --tls-keys -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

npm run solo-test -- network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2 --release-tag "${CONSENSUS_NODE_VERSION}"

npm run solo-test -- node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}"
npm run solo-test -- node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100

npm run solo-test -- node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --upgrade-version v0.59.5 -q
npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100

npm run solo-test -- node upgrade -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --upgrade-version v0.61.7 -q
npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}" --hbar-amount 100
