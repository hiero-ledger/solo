#!/bin/bash
set -eo pipefail

releaseTag="${1}"
if [[ -z "${releaseTag}" ]]; then
  echo "Usage: $0 <releaseTag>"
  exit 1
fi

npm install -g @hashgraph/solo@"${releaseTag}" --force
solo --version

SOLO_CLUSTER_NAME=solo-e2e
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-e2e

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*

echo "Launch solo using released version ${releaseTag}"

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

# trigger migration
npm run solo-test -- account create --deployment "${SOLO_DEPLOYMENT}"

# uninstall components using current version
npm run solo-test -- explorer destroy --deployment "${SOLO_DEPLOYMENT}" --force
npm run solo-test -- relay destroy -i node1,node2 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
npm run solo-test -- mirror-node destroy --deployment "${SOLO_DEPLOYMENT}" --force
npm run solo-test -- node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- network destroy --deployment "${SOLO_DEPLOYMENT}" --force
