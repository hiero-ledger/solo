#!/bin/bash
set -eo pipefail

export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_DEPLOYMENT=solo-deployment
export NODE_ALIASES="node1,node2"

kind delete cluster --name "${SOLO_CLUSTER_NAME}" >/dev/null 2>&1 || true
kind create cluster -n "${SOLO_CLUSTER_NAME}"
rm -f "${HOME}/.solo/local-config.yaml"
rm -rf "${HOME}/.solo/cache"/*



npm run solo-test -- init
npm run solo-test -- cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
npm run solo-test -- deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 2
npm run solo-test -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
npm run solo-test -- block node add --deployment "${SOLO_DEPLOYMENT}" 
npm run solo-test -- keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
npm run solo-test -- consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}" --tss
npm run solo-test -- consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}" #--local-build-path ../hiero-consensus-node/hedera-node/data
npm run solo-test -- consensus node start --deployment "${SOLO_DEPLOYMENT}" -i "${NODE_ALIASES}"
# npm run solo-test -- mirror node add --deployment "${SOLO_DEPLOYMENT}" --enable-ingress
# npm run solo-test -- relay node add --deployment "${SOLO_DEPLOYMENT}"
# npm run solo-test -- explorer node add --deployment "${SOLO_DEPLOYMENT}"
##
#export SOLO_NAMESPACE=solo;export SOLO_DEPLOYMENT=solo-deployment;  .github/workflows/script/solo_smoke_test.sh

