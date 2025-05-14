#!/bin/bash
set -eo pipefail

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-e2e

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*

solo init
solo cluster setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
solo node keys --gossip-keys --tls-keys -i node1,node2
solo deployment create -i node1,node2 -n "${SOLO_NAMESPACE}" --context kind-"${SOLO_CLUSTER_NAME}" --email john@doe.com --deployment-clusters kind-"${SOLO_CLUSTER_NAME}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --deployment "${SOLO_DEPLOYMENT}"
solo network deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

solo node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
solo node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
solo mirror-node deploy  --deployment "${SOLO_DEPLOYMENT}"
solo explorer deploy -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
solo relay deploy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

solo relay destroy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
solo explorer destroy --deployment "${SOLO_DEPLOYMENT}" --force
solo mirror-node destroy --deployment "${SOLO_DEPLOYMENT}" --force
solo node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
solo network destroy --deployment "${SOLO_DEPLOYMENT}" --force
solo cluster reset -s "${SOLO_CLUSTER_SETUP_NAMESPACE}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --force
