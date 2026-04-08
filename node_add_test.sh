#!/bin/bash
set -eo pipefail


#npm install -g @hashgraph/solo@0.38.0

export SOLO_CLUSTER_NAME=solo-e2e
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
export SOLO_DEPLOYMENT=solo-e2e

#for cluster in $(kind get clusters);do;kind delete cluster -n $cluster;done
rm -Rf ~/.solo

kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"

kind load docker-image curlimages/curl:8.9.1 --name "${SOLO_CLUSTER_NAME}"
kind load docker-image busybox:1.36.1 --name "${SOLO_CLUSTER_NAME}"
kind load docker-image envoyproxy/envoy:v1.21.1 --name "${SOLO_CLUSTER_NAME}"
kind load docker-image haproxytech/haproxy-alpine:2.4.25 --name "${SOLO_CLUSTER_NAME}"
kind load docker-image ghcr.io/hashgraph/solo-containers/backup-uploader:0.35.0 --name "${SOLO_CLUSTER_NAME}"
kind load docker-image ghcr.io/hashgraph/solo-containers/ubi8-init-java21:0.38.0 --name "${SOLO_CLUSTER_NAME}"
kind load docker-image ghcr.io/mhga24/envoyproxy/envoy:v1.22.0 --name "${SOLO_CLUSTER_NAME}"
kind load docker-image quay.io/minio/operator:v5.0.7  --name "${SOLO_CLUSTER_NAME}"
kind load docker-image quay.io/minio/minio:RELEASE.2024-02-09T21-25-16Z  --name "${SOLO_CLUSTER_NAME}"
kind load docker-image ghcr.io/hashgraph/solo-cheetah/cheetah:0.3.1 --name "${SOLO_CLUSTER_NAME}"


solo init
#cp application.properties.new ~/.solo/cache/templates/application.properties

solo -- cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

# connect to the cluster you created in a previous command
solo cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}


#create the deployment
solo deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"

# Add a cluster to the deployment you created
solo deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1
# If the command line command is unresponsive there's also a handy cluster add configurator you can run `solo deployment add-cluster` without any arguments to get a guided setup.

solo node keys --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}"

solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

solo network deploy --deployment "${SOLO_DEPLOYMENT}" --pvcs true

# node setup
solo node setup --deployment "${SOLO_DEPLOYMENT}" --release-tag v0.63.7

# start your node/nodes
solo node start --deployment "${SOLO_DEPLOYMENT}"

# Deploy with explicit configuration
solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}

# Consensus Service for node1 (node ID = 0): localhost:50211
kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 > /dev/null 2>&1 &
# Explorer UI: http://localhost:8080
kubectl port-forward svc/hiero-explorer -n "${SOLO_NAMESPACE}" 8080:80 > /dev/null 2>&1 &
# Mirror Node gRPC: localhost:5600
kubectl port-forward svc/mirror-grpc -n "${SOLO_NAMESPACE}" 5600:5600 &
# Mirror Node REST API: http://localhost:5551
kubectl port-forward svc/mirror-rest -n "${SOLO_NAMESPACE}" svc/mirror-rest 5551:80 &
# Mirror Node REST Java API http://localhost:8084
kubectl port-forward service/mirror-restjava -n "${SOLO_NAMESPACE}" 8084:80 &
# JSON RPC Relay: localhost:7546
kubectl port-forward svc/relay-node1-hedera-json-rpc-relay -n "${SOLO_NAMESPACE}" 7546:7546 > /dev/null 2>&1 &

solo node add-prepare --deployment "${SOLO_DEPLOYMENT}" --gossip-keys true --tls-keys true --pvcs true --release-tag v0.63.7 --output-dir context --admin-key 302e020100300506032b657004220420273389ed26af9c456faa81e9ae4004520130de36e4f534643b7081db21744496
