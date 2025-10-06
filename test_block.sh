#!/bin/bash
set -eo pipefail

# Function to verify block node functionality
verify_block_node() {
  cd test/data
  OUTPUT=$(./get-block.sh 1)
  # echo "$OUTPUT"
  if echo "$OUTPUT" | grep -q '"status": "SUCCESS"'; then
    echo "✓ Block node test passed - status is SUCCESS"
  else
    echo "✗ Block node test failed - status is not SUCCESS"
    exit 1
  fi
  cd ../..
}

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-deployment

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

rm -rf ~/.solo/*; rm -rf test/data/tmp/*;

npm run solo-test -- cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
npm run solo-test -- deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 2
npm run solo-test -- cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

export BLOCK_NODE_CHART=block-node-helm-chart
npm run solo-test -- block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" --chart-version 0.18.0
unset BLOCK_NODE_CHART


npm run solo-test -- keys consensus generate --gossip-keys --tls-keys -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

npm run solo-test -- consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2
npm run solo-test -- consensus node setup -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- consensus node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

kubectl port-forward --namespace "${SOLO_NAMESPACE}" svc/block-node-1 40840:40840 &

verify_block_node

npm run solo-test -- consensus node stop -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- block node upgrade --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}"
npm run solo-test -- consensus node start -i node1,node2 --deployment "${SOLO_DEPLOYMENT}"

curl http://127.0.0.1:40840 || true # kill old port-forward after block node pod restarts
kubectl port-forward --namespace "${SOLO_NAMESPACE}" svc/block-node-1 40840:40840 &

verify_block_node

