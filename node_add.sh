SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-deployment

rm -Rf ~/.solo
kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"
npm run solo-test -- init
npm run solo-test -- cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

npm run solo-test -- cluster-ref connect --context kind-${SOLO_CLUSTER_NAME}
npm run solo-test -- deployment create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
npm run solo-test -- deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --num-consensus-nodes 2
npm run solo-test -- node keys --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys -i node1,node2

npm run solo-test -- network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2 --pvcs true
npm run solo-test -- node setup --deployment "${SOLO_DEPLOYMENT}" -i node1,node2 --local-build-path
npm run solo-test -- node start --deployment "${SOLO_DEPLOYMENT}" -i node1,node2

npm run solo-test -- node add --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys --pvcs true


