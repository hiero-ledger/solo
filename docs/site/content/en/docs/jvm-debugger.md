---
title: "Attach JVM Debugger and Retrieve Logs"
weight: 100
description: >
    This document describes how to attach a JVM debugger to a running Hiero Consensus Node and retrieve logs for debugging purposes.
    It also provides instructions on how to save and reuse network state files.
type: docs
---

## How to Debug a Hiero Consensus Node

### 1. Using k9s to access running consensus node logs

Running the command `k9s -A` in terminal, and select one of the network nodes:

![alt text](select_network_node0.png)

Next, select the `root-container` and press the key `s` to enter the shell of the container.

![alt text](select_root_container.png)

Once inside the shell, you can change to directory `cd /opt/hgcapp/services-hedera/HapiApp2.0/`
to view all hedera related logs and properties files.

```bash
[root@network-node1-0 hgcapp]# cd /opt/hgcapp/services-hedera/HapiApp2.0/
[root@network-node1-0 HapiApp2.0]# pwd
/opt/hgcapp/services-hedera/HapiApp2.0
[root@network-node1-0 HapiApp2.0]# ls -ltr data/config/
total 0
lrwxrwxrwx 1 root root 27 Dec  4 02:05 bootstrap.properties -> ..data/bootstrap.properties
lrwxrwxrwx 1 root root 29 Dec  4 02:05 application.properties -> ..data/application.properties
lrwxrwxrwx 1 root root 32 Dec  4 02:05 api-permission.properties -> ..data/api-permission.properties
[root@network-node1-0 HapiApp2.0]# ls -ltr output/
total 1148
-rw-r--r-- 1 hedera hedera       0 Dec  4 02:06 hgcaa.log
-rw-r--r-- 1 hedera hedera       0 Dec  4 02:06 queries.log
drwxr-xr-x 2 hedera hedera    4096 Dec  4 02:06 transaction-state
drwxr-xr-x 2 hedera hedera    4096 Dec  4 02:06 state
-rw-r--r-- 1 hedera hedera     190 Dec  4 02:06 swirlds-vmap.log
drwxr-xr-x 2 hedera hedera    4096 Dec  4 16:01 swirlds-hashstream
-rw-r--r-- 1 hedera hedera 1151446 Dec  4 16:07 swirlds.log
```

Alternatively, you can use the following command to download hgcaa.log and
swirlds.log for further analysis.

```bash
# download logs as zip file from node1 and save in default ~/.solo/logs/<namespace>/<timestamp/
solo consensus diagnostics all --deployment solo-deployment
```

### 2. Using IntelliJ remote debug with Solo

NOTE: the hiero-consensus-node path referenced '../hiero-consensus-node/hedera-node/data' may
need to be updated based on what directory you are currently in.  This also assumes that you have done an assemble/build and the directory contents are up-to-date.

Set up an Intellij run/debug configuration for remote JVM debug as shown in the below screenshot:

![alt text](jvm-hedera-app.png)

If you are working on a Hiero Consensus Node testing application, you should use the following configuration
in Intellij:

![alt text](jvm-platform-app.png)

Set up a breakpoint if necessary.

From Solo repo directory, run the following command from a terminal to launch a three node network, assume we are trying to attach debug to `node2`.
Make sure the path following `local-build-path` points to the correct directory.

Example 1: attach jvm debugger to a Hiero Consensus Node

```bash
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-deployment

rm -Rf ~/.solo # to avoid name collision issues if you ran previously with the same deployment name
kind delete cluster -n "${SOLO_CLUSTER_NAME}" 
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

solo cluster-ref config connect --cluster-ref ${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
solo deployment config create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --num-consensus-nodes 3
solo keys consensus generate --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys -i node1,node2,node3

solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3 --debug-node-alias node2
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3 --local-build-path ../hiero-consensus-node/hedera-node/data
solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3 --debug-node-alias node2
```

Once you see the following message, you can launch the JVM debugger from Intellij

```
❯ Check all nodes are ACTIVE
  Check node: node1,
  Check node: node2,  Please attach JVM debugger now.
  Check node: node3,
```

The Hiero Consensus Node application should stop at the breakpoint you set:

![alt text](hedera-breakpoint.png)
![alt text](platform-breakpoint.png)

Example 2: attach a JVM debugger with the consensus node add operation

```bash
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-deployment

rm -Rf ~/.solo
kind delete cluster -n "${SOLO_CLUSTER_NAME}" 
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

solo cluster-ref config connect --cluster-ref ${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
solo deployment config create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --num-consensus-nodes 3
solo keys consensus generate --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys -i node1,node2,node3

solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3 --pvcs true
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3 --local-build-path ../hiero-consensus-node/hedera-node/data
solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3

solo consensus node add --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys --debug-node-alias node4 --local-build-path ../hiero-consensus-node/hedera-node/data --pvcs true
```

Example 3: attach a JVM debugger with the consensus node update operation

```bash
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-deployment

rm -Rf ~/.solo
kind delete cluster -n "${SOLO_CLUSTER_NAME}" 
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

solo cluster-ref config connect --cluster-ref ${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
solo deployment config create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --num-consensus-nodes 3
solo keys consensus generate --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys -i node1,node2,node3

solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3 --local-build-path ../hiero-consensus-node/hedera-node/data
solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3

solo consensus node update --deployment "${SOLO_DEPLOYMENT}" --node-alias node2  --debug-node-alias node2 --local-build-path ../hiero-consensus-node/hedera-node/data --new-account-number 0.0.7 --gossip-public-key ./s-public-node2.pem --gossip-private-key ./s-private-node2.pem --release-tag v0.59.5
```

Example 4: attach a JVM debugger with the node delete operation

```bash
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-deployment

rm -Rf ~/.solo
kind delete cluster -n "${SOLO_CLUSTER_NAME}" 
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

solo cluster-ref config connect --cluster-ref ${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
solo deployment config create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --num-consensus-nodes 3
solo keys consensus generate --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys -i node1,node2,node3

solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3 --local-build-path ../hiero-consensus-node/hedera-node/data
solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3

solo consensus node destroy --deployment "${SOLO_DEPLOYMENT}" --node-alias node2  --debug-node-alias node3 --local-build-path ../hiero-consensus-node/hedera-node/data
```

### 3. Save and reuse network state files

With the following command you can save the network state to a file.

```bash
# must stop hedera node operation first
solo consensus node stop --deployment "${SOLO_DEPLOYMENT}"

# download state file to default location at ~/.solo/logs/<namespace>
solo consensus state download -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

By default, the state files are saved under `~/.solo` directory

```bash
└── logs
    ├── solo-e2e
    │   ├── network-node1-0-state.zip
    │   └── network-node2-0-state.zip
    └── solo.log
```

Later, user can use the following command to upload the state files to the network and restart Hiero Consensus Nodes.

```bash
SOLO_CLUSTER_NAME=solo-cluster
SOLO_NAMESPACE=solo-e2e
SOLO_CLUSTER_SETUP_NAMESPACE=solo-setup
SOLO_DEPLOYMENT=solo-deployment

rm -Rf ~/.solo
kind delete cluster -n "${SOLO_CLUSTER_NAME}" 
kind create cluster -n "${SOLO_CLUSTER_NAME}"
solo init
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"

solo cluster-ref config connect --cluster-ref ${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
solo deployment config create --namespace "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref ${SOLO_CLUSTER_NAME} --num-consensus-nodes 3
solo keys consensus generate --deployment "${SOLO_DEPLOYMENT}" --gossip-keys --tls-keys -i node1,node2,node3

solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3 --local-build-path ../hiero-consensus-node/hedera-node/data
solo consensus node start --deployment "${SOLO_DEPLOYMENT}" -i node1,node2,node3
solo consensus node stop --deployment "${SOLO_DEPLOYMENT}"

solo consensus node states -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"

# start network with pre-existing state files
solo consensus node start --deployment "${SOLO_DEPLOYMENT}" --state-file network-node1-0-state.zip
```
