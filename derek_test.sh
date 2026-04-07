#!/bin/bash
set -eo pipefail

export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_DEPLOYMENT=solo-deployment
export CONSENSUS_NODE_COUNT=2
export NODE_ALIASES="node1,node2"

echo "Creating Kind cluster ${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

echo "Configuring Solo deployment"
solo cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
echo "Deleting existing Solo deployment config ${SOLO_DEPLOYMENT} (if any)"
solo deployment config delete --deployment "${SOLO_DEPLOYMENT}" --quiet-mode >/dev/null 2>&1 || true
solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes "${CONSENSUS_NODE_COUNT}"
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --prometheus-stack true


solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"

solo consensus network deploy --dev --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"  --service-monitor true --pod-log true --pvcs true 
