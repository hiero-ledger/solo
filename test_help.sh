#!/bin/bash
set -ex

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-deployment
export CONSENSUS_VERSION=v0.69.0-rc.2
export BLOCK_NODE_CHART_VERSION=v0.23.2

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*; rm -rf test/data/tmp/*;

solo init
solo cluster-ref config connect --cluster-ref kind-"${SOLO_CLUSTER_NAME}" \
  --context kind-"${SOLO_CLUSTER_NAME}"
solo deployment config create --deployment "${SOLO_DEPLOYMENT}" --namespace "${SOLO_NAMESPACE}"
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" \
  --num-consensus-nodes 1
solo cluster-ref config setup --cluster-ref kind-"${SOLO_CLUSTER_NAME}"

if [ "BLOCK" = "BLOCK" ]; then
  solo block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" \
    --chart-version "${BLOCK_NODE_CHART_VERSION}" --release-tag "${CONSENSUS_VERSION}"
fi
solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" -i node1
solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_VERSION}"
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i node1 --release-tag "${CONSENSUS_VERSION}"
solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -i node1

solo mirror node add --cluster-ref kind-"${SOLO_CLUSTER_NAME}" --deployment "${SOLO_DEPLOYMENT}" --pinger --enable-ingress
