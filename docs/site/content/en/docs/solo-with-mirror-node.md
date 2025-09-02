---
title: "Using Solo with Mirror Node"
weight: 60
description: >
    This document describes how to use Solo with Mirror Node.
type: docs
---

## Using Solo with mirror node

User can deploy a Solo network with Mirror Node by running the following command:

```bash
export SOLO_CLUSTER_NAME=solo-cluster
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster-setup
export SOLO_DEPLOYMENT=solo-deployment

rm -Rf ~/.solo
kind delete cluster -n "${SOLO_CLUSTER_NAME}"
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster-ref config setup --cluster-setup-namespace "${SOLO_CLUSTER_SETUP_NAMESPACE}"
solo cluster-ref config connect --cluster-ref ${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
solo deployment config create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --num-consensus-nodes 2
solo keys consensus generate --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys -i node1,node2
solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2
solo consensus node setup     --deployment "${SOLO_DEPLOYMENT}" -i node1,node2
solo consensus node start     --deployment "${SOLO_DEPLOYMENT}" -i node1,node2
solo mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --enable-ingress --pinger
solo explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME}

```

The `--pinger` flag in `solo mirror node add` starts a pinging service that sends transactions to the network at regular intervals. This is needed because the record file is not imported into the mirror node until the next one is created.

Then you can access the Explorer at <http://localhost:8080>

Or you can use Task tool to deploy Solo network with Mirror Node with a single command [link](../development/task-tool)

Next, you can try to create a few accounts with Solo and see the transactions in the Explorer.

```bash
solo ledger account create --deployment solo-deployment --hbar-amount 100
solo ledger account create --deployment solo-deployment --hbar-amount 100
```

Or you can use Hedera JavaScript SDK examples to create topic, submit message and subscribe to the topic.

<!---
Add SDK.md link here
-->

* [Instructions for using Solo with Hiero JavaScript SDK](javascript-sdk.md)

If you need to access mirror node service directly, use the following command to enable port forwarding, or just use `localhost:8081` as it should have all the mirror node services exposed to this port:

```bash
kubectl port-forward svc/mirror-grpc -n "${SOLO_NAMESPACE}" 5600:5600 &
grpcurl -plaintext "${GRPC_IP:-127.0.0.1}:5600" list

kubectl port-forward svc/mirror-rest -n "${SOLO_NAMESPACE}" svc/mirror-rest 5551:80 &
curl -s "http://${REST_IP:-127.0.0.1}:5551/api/v1/transactions?limit=1"

kubectl port-forward service/mirror-restjava -n "${SOLO_NAMESPACE}" 8084:80 &
curl -s "http://${REST_IP:-127.0.0.1}:8084/api/v1/accounts/0.0.2/allowances/nfts"
```
