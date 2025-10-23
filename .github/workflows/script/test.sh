#!/usr/bin/env bash
set -euxo pipefail

# ===========
# INIT STAGE
# ===========

# Install solo (cached)
if [ ! -f /tmp/solo-${USER}-solo-install-* ]; then
  npm install
  touch /tmp/solo-${USER}-solo-install-$(date +%s)
fi

rm -rf dist
npx tsc
node ../resources/post-build-script.js

# ==========================
# DEFAULT TASK (MAIN DEPLOY)
# ==========================

# kubectl install (mac/linux)
if [[ "$(uname)" == "Darwin" ]]; then
  brew install kubernetes-cli || true
else
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
  chmod +x kubectl && mv kubectl /usr/local/bin/
fi

# -------- CLUSTER & DEPLOYMENT SETUP --------

npm run solo -- init --dev

npm run solo -- cluster setup --context gke_hashsphere-staging_us-central1_jeromy-sphere-load-test-us-central

npm run solo -- cluster-ref config connect \
  --cluster-ref kind- \
  --context gke_hashsphere-staging_us-central1_jeromy-sphere-load-test-us-central

npm run solo -- deployment config create \
  -n solo-gke-test \
  --deployment solo-deployment-gke-test

npm run solo -- deployment cluster attach \
  --cluster-ref kind- \
  --deployment solo-deployment-gke-test \
  --num-consensus-nodes 4

npm run solo -- consensus node key-gen \
  --deployment solo-deployment-gke-test \
  --node-aliases node1,node2,node3,node4

npm run solo -- consensus block add \
  --deployment solo-deployment-gke-test

npm run solo -- consensus network deploy \
  --deployment solo-deployment-gke-test \
  --node-aliases node1,node2,node3,node4 \
  --values-file $PWD/init-containers-values.yaml \
  --settings-txt $PWD/settings.txt \
  --log4j2-xml $PWD/log4j2.xml \
  --application-properties $PWD/application.properties \
  --genesis-throttles-file $PWD/throttles.json \
  --load-balancer true \
  -q --dev

npm run solo -- consensus node setup \
  --deployment solo-deployment-gke-test \
  --node-aliases node1,node2,node3,node4 \
  -q --dev

npm run solo -- consensus node start \
  --deployment solo-deployment-gke-test \
  --node-aliases node1,node2,node3,node4 \
  -q --dev

npm run solo -- mirror node add \
  --deployment solo-deployment-gke-test \
  --cluster-ref kind- \
  --values-file $PWD/mirror-node-values.yaml \
  --mirror-static-ip 34.55.235.252 \
  --enable-ingress \
  --pinger \
  -q --dev

npm run solo -- deployment config create \
  --deployment explorer-deployment \
  --namespace explorer-name-space

npm run solo -- deployment cluster attach \
  --deployment explorer-deployment \
  --cluster-ref kind- \
  --num-consensus-nodes 4

npm run solo -- explorer node add \
  --deployment explorer-deployment \
  --cluster-ref kind- \
  --mirrorNamespace solo-gke-test \
  --values-file $PWD/ingress-values.yaml \
  --explorer-static-ip 35.226.75.168 \
  --enable-explorer-tls \
  --tls-cluster-issuer-type acme-staging \
  --enable-ingress \
  -q --dev

