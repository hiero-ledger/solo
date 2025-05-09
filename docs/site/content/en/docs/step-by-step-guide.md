---
title: "Step By Step Guide"
weight: 20
description: >
    This guide provides step by step instructions to set up a solo network using Kubernetes.
type: docs
---

## Solo User Guide

### Table of Contents

* [Setup Kubernetes cluster](#setup-kubernetes-cluster)
  * [Remote cluster](#remote-cluster)
  * [Local cluster](#local-cluster)
* [Step by Step Instructions](#step-by-step-instructions)
  * [Initialize solo directories](#initialize-solo-directories)
  * [Generate pem formatted node keys](#generate-pem-formatted-node-keys)
  * [Create a deployment in the specified clusters](#create-a-deployment-in-the-specified-clusters-generate-remoteconfig-and-localconfig-objects)
  * [Setup cluster with shared components](#setup-cluster-with-shared-components)
  * [Create a solo deployment](#create-a-solo-deployment)
  * [Deploy helm chart with Hedera network components](#deploy-helm-chart-with-hedera-network-components)
  * [Setup node with Hedera platform software](#setup-node-with-hedera-platform-software)
  * [Deploy mirror node](#deploy-mirror-node)
  * [Deploy explorer mode](#deploy-explorer-mode)
  * [Deploy a JSON RPC relay](#deploy-a-json-rpc-relay)
  * [Execution Developer](#execution-developer)
  * [Destroy relay node](#destroy-relay-node)
  * [Destroy mirror node](#destroy-mirror-node)
  * [Destroy explorer node](#destroy-explorer-node)
  * [Destroy network](#destroy-network)

For those who would like to have more control or need some customized setups, here are some step by step instructions of how to setup and deploy a solo network.

### Setup Kubernetes cluster

#### Remote cluster

* You may use remote kubernetes cluster. In this case, ensure kubernetes context is set up correctly.

```
kubectl config use-context <context-name>
```

#### Local cluster

* You may use [kind](https://kind.sigs.k8s.io/) or [microk8s](https://microk8s.io/) to create a cluster. In this case,
  ensure your Docker engine has enough resources (e.g. Memory >=8Gb, CPU: >=4). Below we show how you can use `kind` to create a cluster

First, use the following command to set up the environment variables:

```
export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_DEVELOPMENT=solo-deployment

```

Then run the following command to set the kubectl context to the new cluster:

```bash
kind create cluster -n "${SOLO_CLUSTER_NAME}"
```

Example output

```
Creating cluster "solo-e2e" ...
 • Ensuring node image (kindest/node:v1.32.2) 🖼  ...
 ✓ Ensuring node image (kindest/node:v1.32.2) 🖼
 • Preparing nodes 📦   ...
 ✓ Preparing nodes 📦 
 • Writing configuration 📜  ...
 ✓ Writing configuration 📜
 • Starting control-plane 🕹️  ...
 ✓ Starting control-plane 🕹️
 • Installing CNI 🔌  ...
 ✓ Installing CNI 🔌
 • Installing StorageClass 💾  ...
 ✓ Installing StorageClass 💾
Set kubectl context to "kind-solo-e2e"
You can now use your cluster with:

kubectl cluster-info --context kind-solo-e2e

Have a nice day! 👋
```

You may now view pods in your cluster using `k9s -A` as below:

```
 Context: kind-solo                                <0> all   <a>       Attach       <ctr… ____  __.________
 Cluster: kind-solo                                          <ctrl-d>  Delete       <l>  |    |/ _/   __   \______
 User:    kind-solo                                          <d>       Describe     <p>  |      < \____    /  ___/
 K9s Rev: v0.32.5                                            <e>       Edit         <shif|    |  \   /    /\___ \
 K8s Rev: v1.27.3                                            <?>       Help         <z>  |____|__ \ /____//____  >
 CPU:     n/a                                                <shift-j> Jump Owner   <s>          \/            \/
 MEM:     n/a
┌───────────────────────────────────────────────── Pods(all)[11] ─────────────────────────────────────────────────┐
│ NAMESPACE↑          NAME                                        PF READY STATUS   RESTARTS IP          NODE     │
│ solo-setup     console-557956d575-4r5xm                    ●  1/1   Running         0 10.244.0.5  solo-con │
│ solo-setup     minio-operator-7d575c5f84-8shc9             ●  1/1   Running         0 10.244.0.6  solo-con │
│ kube-system         coredns-5d78c9869d-6cfbg                    ●  1/1   Running         0 10.244.0.4  solo-con │
│ kube-system         coredns-5d78c9869d-gxcjz                    ●  1/1   Running         0 10.244.0.3  solo-con │
│ kube-system         etcd-solo-control-plane                     ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kindnet-k75z6                               ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kube-apiserver-solo-control-plane           ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kube-controller-manager-solo-control-plane  ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kube-proxy-cct7t                            ●  1/1   Running         0 172.18.0.2  solo-con │
│ kube-system         kube-scheduler-solo-control-plane           ●  1/1   Running         0 172.18.0.2  solo-con │
│ local-path-storage  local-path-provisioner-6bc4bddd6b-gwdp6     ●  1/1   Running         0 10.244.0.2  solo-con │
│                                                                                                                 │
│                                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Step by Step Instructions

#### Initialize `solo` directories:

```
# reset .solo directory
rm -rf ~/.solo

solo init
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: init
**********************************************************************************
❯ Setup home directory and cache
✔ Setup home directory and cache
❯ Check dependencies
❯ Check dependency: helm [OS: darwin, Release: 23.6.0, Arch: arm64]
✔ Check dependency: helm [OS: darwin, Release: 23.6.0, Arch: arm64]
✔ Check dependencies
❯ Create local configuration
↓ Create local configuration [SKIPPED: Create local configuration]
❯ Setup chart manager
push repo hedera-json-rpc-relay -> https://hiero-ledger.github.io/hiero-json-rpc-relay/charts
push repo mirror -> https://hashgraph.github.io/hedera-mirror-node/charts
push repo haproxy-ingress -> https://haproxy-ingress.github.io/charts
✔ Setup chart manager
❯ Copy templates in '/Users/user/.solo/cache'

***************************************************************************************
Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: /Users/user/.solo
If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.
***************************************************************************************
✔ Copy templates in '/Users/user/.solo/cache'
```

#### Create a deployment in the specified clusters, generate RemoteConfig and LocalConfig objects.

* Associates a cluster reference to a k8s context

```
solo cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_SETUP_NAMESPACE} --context kind-${SOLO_CLUSTER_NAME}
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: cluster-ref connect --cluster-ref kind-solo-e2e --context kind-solo-e2e
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Validating cluster ref: 
✔ kind-solo-e2e
❯ Test connection to cluster: 
✔ Test connection to cluster: kind-solo-e2e
❯ Associate a context with a cluster reference: 
✔ Associate a context with a cluster reference: kind-solo-e2e
```

* Create a deployment

```
solo deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: deployment create --namespace solo --deployment solo-deployment --realm 0 --shard 0
Kubernetes Namespace	: solo
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Add deployment to local config
✔ Adding deployment: solo-deployment with namespace: solo to local config
```

* Add a cluster to deployment

```
solo deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_SETUP_NAMESPACE} --num-consensus-nodes 3
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: deployment add-cluster --deployment solo-deployment --cluster-ref kind-solo-e2e --num-consensus-nodes 3
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Verify args
✔ Verify args
❯ check network state
✔ check network state
❯ Test cluster connection
✔ Test cluster connection: kind-solo-e2e, context: kind-solo-e2e
❯ Verify prerequisites
✔ Verify prerequisites
❯ add cluster-ref in local config deployments
✔ add cluster-ref: kind-solo-e2e for deployment: solo-deployment in local config
❯ create remote config for deployment
✔ create remote config for deployment: solo-deployment in cluster: kind-solo-e2e
```

#### Generate `pem` formatted node keys

```
solo node keys --gossip-keys --tls-keys -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: node keys --gossip-keys --tls-keys --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Generate gossip keys
❯ Backup old files
✔ Backup old files
❯ Gossip key for node: node1
✔ Gossip key for node: node1
❯ Gossip key for node: node2
✔ Gossip key for node: node2
❯ Gossip key for node: node3
✔ Gossip key for node: node3
✔ Generate gossip keys
❯ Generate gRPC TLS Keys
❯ Backup old files
❯ TLS key for node: node1
❯ TLS key for node: node2
❯ TLS key for node: node3
✔ Backup old files
✔ TLS key for node: node3
✔ TLS key for node: node2
✔ TLS key for node: node1
✔ Generate gRPC TLS Keys
❯ Finalize
✔ Finalize
```

PEM key files are generated in `~/.solo/cache/keys` directory.

```
hedera-node1.crt    hedera-node3.crt    s-private-node1.pem s-public-node1.pem  unused-gossip-pem
hedera-node1.key    hedera-node3.key    s-private-node2.pem s-public-node2.pem  unused-tls
hedera-node2.crt    hedera-node4.crt    s-private-node3.pem s-public-node3.pem
hedera-node2.key    hedera-node4.key    s-private-node4.pem s-public-node4.pem
```

#### Setup cluster with shared components

```
solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: cluster-ref setup --cluster-setup-namespace solo-cluster
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Prepare chart values
✔ Prepare chart values
❯ Install 'solo-cluster-setup' chart
********************** Installed solo-cluster-setup chart **********************
Version			: 0.50.0
********************************************************************************
✔ Install 'solo-cluster-setup' chart
```

In a separate terminal, you may run `k9s` to view the pod status.

#### Deploy helm chart with Hedera network components

It may take a while (5~15 minutes depending on your internet speed) to download various docker images and get the pods started.

If it fails, ensure you have enough resources allocated for Docker engine and retry the command.

```
solo network deploy -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: network deploy --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Copy gRPC TLS Certificates
↓ Copy gRPC TLS Certificates [SKIPPED: Copy gRPC TLS Certificates]
❯ Check if cluster setup chart is installed
✔ Check if cluster setup chart is installed
❯ Prepare staging directory
❯ Copy Gossip keys to staging
✔ Copy Gossip keys to staging
❯ Copy gRPC TLS keys to staging
✔ Copy gRPC TLS keys to staging
✔ Prepare staging directory
❯ Copy node keys to secrets
❯ Copy TLS keys
❯ Node: node1, cluster: kind-solo-e2e
❯ Node: node2, cluster: kind-solo-e2e
❯ Node: node3, cluster: kind-solo-e2e
❯ Copy Gossip keys
❯ Copy Gossip keys
❯ Copy Gossip keys
✔ Copy Gossip keys
✔ Node: node1, cluster: kind-solo-e2e
✔ Copy Gossip keys
✔ Node: node3, cluster: kind-solo-e2e
✔ Copy Gossip keys
✔ Node: node2, cluster: kind-solo-e2e
✔ Copy TLS keys
✔ Copy node keys to secrets
❯ Install chart 'solo-deployment'
*********************** Installed solo-deployment chart ************************
Version			: 0.50.0
********************************************************************************
✔ Install chart 'solo-deployment'
❯ Check for load balancer
↓ Check for load balancer [SKIPPED: Check for load balancer]
❯ Redeploy chart with external IP address config
↓ Redeploy chart with external IP address config [SKIPPED: Redeploy chart with external IP address config]
❯ Check node pods are running
❯ Check Node: node1, Cluster: kind-solo-e2e
✔ Check Node: node1, Cluster: kind-solo-e2e
❯ Check Node: node2, Cluster: kind-solo-e2e
✔ Check Node: node2, Cluster: kind-solo-e2e
❯ Check Node: node3, Cluster: kind-solo-e2e
✔ Check Node: node3, Cluster: kind-solo-e2e
✔ Check node pods are running
❯ Check proxy pods are running
❯ Check HAProxy for: node1, cluster: kind-solo-e2e
❯ Check HAProxy for: node2, cluster: kind-solo-e2e
❯ Check HAProxy for: node3, cluster: kind-solo-e2e
❯ Check Envoy Proxy for: node1, cluster: kind-solo-e2e
❯ Check Envoy Proxy for: node2, cluster: kind-solo-e2e
❯ Check Envoy Proxy for: node3, cluster: kind-solo-e2e
✔ Check HAProxy for: node3, cluster: kind-solo-e2e
✔ Check Envoy Proxy for: node1, cluster: kind-solo-e2e
✔ Check HAProxy for: node1, cluster: kind-solo-e2e
✔ Check Envoy Proxy for: node2, cluster: kind-solo-e2e
✔ Check Envoy Proxy for: node3, cluster: kind-solo-e2e
✔ Check HAProxy for: node2, cluster: kind-solo-e2e
✔ Check proxy pods are running
❯ Check auxiliary pods are ready
❯ Check MinIO
✔ Check MinIO
✔ Check auxiliary pods are ready
❯ Add node and proxies to remote config
✔ Add node and proxies to remote config
```

#### Setup node with Hedera platform software.

* It may take a while as it download the hedera platform code from <https://builds.hedera.com/>

```
solo node setup -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: node setup --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Validate nodes states
❯ Validating state for node node1
✔ Validating state for node node1 - valid state: requested
❯ Validating state for node node2
✔ Validating state for node node2 - valid state: requested
❯ Validating state for node node3
✔ Validating state for node node3 - valid state: requested
✔ Validate nodes states
❯ Identify network pods
❯ Check network pod: node1
❯ Check network pod: node2
❯ Check network pod: node3
✔ Check network pod: node1
✔ Check network pod: node3
✔ Check network pod: node2
✔ Identify network pods
❯ Fetch platform software into network nodes
❯ Update node: node1 [ platformVersion = v0.59.5, context = kind-solo-e2e ]
❯ Update node: node2 [ platformVersion = v0.59.5, context = kind-solo-e2e ]
❯ Update node: node3 [ platformVersion = v0.59.5, context = kind-solo-e2e ]
✔ Update node: node2 [ platformVersion = v0.59.5, context = kind-solo-e2e ]
✔ Update node: node1 [ platformVersion = v0.59.5, context = kind-solo-e2e ]
✔ Update node: node3 [ platformVersion = v0.59.5, context = kind-solo-e2e ]
✔ Fetch platform software into network nodes
❯ Setup network nodes
❯ Node: node1
❯ Node: node2
❯ Node: node3
❯ Copy configuration files
❯ Copy configuration files
❯ Copy configuration files
✔ Copy configuration files
❯ Set file permissions
✔ Copy configuration files
❯ Set file permissions
✔ Copy configuration files
❯ Set file permissions
✔ Set file permissions
✔ Node: node2
✔ Set file permissions
✔ Node: node3
✔ Set file permissions
✔ Node: node1
✔ Setup network nodes
❯ Change node state to setup in remote config
✔ Change node state to setup in remote config
```

* Start the nodes

```
solo node start -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: node start --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Validate nodes states
❯ Validating state for node node1
✔ Validating state for node node1 - valid state: setup
❯ Validating state for node node2
✔ Validating state for node node2 - valid state: setup
❯ Validating state for node node3
✔ Validating state for node node3 - valid state: setup
✔ Validate nodes states
❯ Identify existing network nodes
❯ Check network pod: node1
❯ Check network pod: node2
❯ Check network pod: node3
✔ Check network pod: node1
✔ Check network pod: node2
✔ Check network pod: node3
✔ Identify existing network nodes
❯ Upload state files network nodes
↓ Upload state files network nodes [SKIPPED: Upload state files network nodes]
❯ Starting nodes
❯ Start node: node1
❯ Start node: node2
❯ Start node: node3
✔ Start node: node2
✔ Start node: node3
✔ Start node: node1
✔ Starting nodes
❯ Enable port forwarding for JVM debugger
↓ Enable port forwarding for JVM debugger [SKIPPED: Enable port forwarding for JVM debugger]
❯ Check all nodes are ACTIVE
❯ Check network pod: node1 
❯ Check network pod: node2 
❯ Check network pod: node3 
✔ Check network pod: node1  - status ACTIVE, attempt: 17/300
✔ Check network pod: node3  - status ACTIVE, attempt: 17/300
✔ Check network pod: node2  - status ACTIVE, attempt: 18/300
✔ Check all nodes are ACTIVE
❯ Check node proxies are ACTIVE
❯ Check proxy for node: node1
✔ Check proxy for node: node1
❯ Check proxy for node: node2
✔ Check proxy for node: node2
❯ Check proxy for node: node3
✔ Check proxy for node: node3
✔ Check node proxies are ACTIVE
❯ Change node state to started in remote config
✔ Change node state to started in remote config
❯ Add node stakes
❯ Adding stake for node: node1
✔ Adding stake for node: node1
❯ Adding stake for node: node2
✔ Adding stake for node: node2
❯ Adding stake for node: node3
✔ Adding stake for node: node3
✔ Add node stakes
```

***

#### Deploy mirror node

```
solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_SETUP_NAMESPACE}
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: mirror-node deploy --deployment solo-deployment --cluster-ref kind-solo-e2e --quiet-mode
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Enable mirror-node
❯ Prepare address book
✔ Prepare address book
❯ Install mirror ingress controller
↓ Install mirror ingress controller [SKIPPED: Install mirror ingress controller]
❯ Deploy mirror-node
**************************** Installed mirror chart ****************************
Version			: v0.126.0
********************************************************************************
✔ Deploy mirror-node
✔ Enable mirror-node
❯ Check pods are ready
❯ Check Postgres DB
❯ Check REST API
❯ Check GRPC
❯ Check Monitor
❯ Check Importer
✔ Check Postgres DB
✔ Check Importer
✔ Check GRPC
✔ Check REST API
✔ Check Monitor
✔ Check pods are ready
❯ Seed DB data
❯ Insert data in public.file_data
✔ Insert data in public.file_data
✔ Seed DB data
❯ Add mirror node to remote config
✔ Add mirror node to remote config
```

#### Deploy explorer mode

```
solo explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_SETUP_NAMESPACE}
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: explorer deploy --deployment solo-deployment --quiet-mode
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Load remote config
✔ Load remote config
❯ Install cert manager
↓ Install cert manager [SKIPPED: Install cert manager]
❯ Install explorer
*********************** Installed hedera-explorer chart ************************
Version			: 24.12.1
********************************************************************************
✔ Install explorer
❯ Install explorer ingress controller
↓ Install explorer ingress controller [SKIPPED: Install explorer ingress controller]
❯ Check explorer pod is ready
✔ Check explorer pod is ready
❯ Check haproxy ingress controller pod is ready
↓ Check haproxy ingress controller pod is ready [SKIPPED: Check haproxy ingress controller pod is ready]
❯ Add explorer to remote config
*********************************** ERROR *****************************************
Explorer deployment failed: Error deploying explorer: Invalid cluster: undefined
***********************************************************************************
```

#### Deploy a JSON RPC relay

```
solo relay deploy -i node1,node2,node3 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: relay deploy --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Check chart is installed
✔ Check chart is installed
❯ Prepare chart values
✔ Prepare chart values
❯ Deploy JSON RPC Relay
******************* Installed relay-node1-node2-node3 chart ********************
Version			: v0.67.0
********************************************************************************
✔ Deploy JSON RPC Relay
❯ Check relay is running
✔ Check relay is running
❯ Check relay is ready
✔ Check relay is ready
❯ Add relay component in remote config
✔ Add relay component in remote config
```

#### Execution Developer

Next: [Execution Developer](execution-developer)

#### Destroy relay node

```
solo relay destroy --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: relay destroy --node-aliases node1,node2,node3 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Destroy JSON RPC Relay

 *** Destroyed Relays ***
-------------------------------------------------------------------------------
 - hedera-explorer [hedera-explorer-chart-24.12.1]
 - mirror [hedera-mirror-0.126.0]
 - solo-deployment [solo-deployment-0.50.0]


✔ Destroy JSON RPC Relay
❯ Remove relay component from remote config
✔ Remove relay component from remote config
```

#### Destroy mirror node

```
solo mirror-node destroy --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: mirror-node destroy --deployment solo-deployment --quiet-mode
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Destroy mirror-node
✔ Destroy mirror-node
❯ Delete PVCs
✔ Delete PVCs
❯ Uninstall mirror ingress controller
✔ Uninstall mirror ingress controller
❯ Remove mirror node from remote config
✔ Remove mirror node from remote config
```

#### Destroy explorer node

```
solo explorer destroy --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: explorer destroy --deployment solo-deployment --quiet-mode
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Load remote config
✔ Load remote config
❯ Destroy explorer
✔ Destroy explorer
❯ Uninstall explorer ingress controller
✔ Uninstall explorer ingress controller
❯ Remove explorer from remote config
*********************************** ERROR *****************************************
Explorer destruction failed: Error destroy explorer: Component mirrorNodeExplorer of type mirrorNodeExplorers not found while attempting to remove
***********************************************************************************
```

#### Destroy network

```
solo network destroy --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.36.0
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: network destroy --deployment solo-deployment --quiet-mode
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Remove deployment from local configuration
✔ Remove deployment from local configuration
❯ Running sub-tasks to destroy network
✔ Deleting the RemoteConfig configmap in namespace solo
```

You may view the list of pods using `k9s` as below:

```
Context: kind-solo                                <0> all   <a>       Attach       <ctr… ____  __.________
 Cluster: kind-solo                                          <ctrl-d>  Delete       <l>  |    |/ _/   __   \______
 User:    kind-solo                                          <d>       Describe     <p>  |      < \____    /  ___/
 K9s Rev: v0.32.5                                            <e>       Edit         <shif|    |  \   /    /\___ \
 K8s Rev: v1.27.3                                            <?>       Help         <z>  |____|__ \ /____//____  >
 CPU:     n/a                                                <shift-j> Jump Owner   <s>          \/            \/
 MEM:     n/a
┌───────────────────────────────────────────────── Pods(all)[31] ─────────────────────────────────────────────────┐
│ NAMESPACE↑          NAME                                                           PF READY STATUS   RESTARTS I │
│ kube-system         coredns-5d78c9869d-994t4                                       ●  1/1   Running         0 1 │
│ kube-system         coredns-5d78c9869d-vgt4q                                       ●  1/1   Running         0 1 │
│ kube-system         etcd-solo-control-plane                                        ●  1/1   Running         0 1 │
│ kube-system         kindnet-q26c9                                                  ●  1/1   Running         0 1 │
│ kube-system         kube-apiserver-solo-control-plane                              ●  1/1   Running         0 1 │
│ kube-system         kube-controller-manager-solo-control-plane                     ●  1/1   Running         0 1 │
│ kube-system         kube-proxy-9b27j                                               ●  1/1   Running         0 1 │
│ kube-system         kube-scheduler-solo-control-plane                              ●  1/1   Running         0 1 │
│ local-path-storage  local-path-provisioner-6bc4bddd6b-4mv8c                        ●  1/1   Running         0 1 │
│ solo                envoy-proxy-node1-65f8879dcc-rwg97                             ●  1/1   Running         0 1 │
│ solo                envoy-proxy-node2-667f848689-628cx                             ●  1/1   Running         0 1 │
│ solo                envoy-proxy-node3-6bb4b4cbdf-dmwtr                             ●  1/1   Running         0 1 │
│ solo                solo-deployment-grpc-75bb9c6c55-l7kvt                     ●  1/1   Running         0 1 │
│ solo                solo-deployment-hedera-explorer-6565ccb4cb-9dbw2          ●  1/1   Running         0 1 │
│ solo                solo-deployment-importer-dd74fd466-vs4mb                  ●  1/1   Running         0 1 │
│ solo                solo-deployment-monitor-54b8f57db9-fn5qq                  ●  1/1   Running         0 1 │
│ solo                solo-deployment-postgres-postgresql-0                     ●  1/1   Running         0 1 │
│ solo                solo-deployment-redis-node-0                              ●  2/2   Running         0 1 │
│ solo                solo-deployment-rest-6d48f8dbfc-plbp2                     ●  1/1   Running         0 1 │
│ solo                solo-deployment-restjava-5d6c4cb648-r597f                 ●  1/1   Running         0 1 │
│ solo                solo-deployment-web3-55fdfbc7f7-lzhfl                     ●  1/1   Running         0 1 │
│ solo                haproxy-node1-785b9b6f9b-676mr                                 ●  1/1   Running         1 1 │
│ solo                haproxy-node2-644b8c76d-v9mg6                                  ●  1/1   Running         1 1 │
│ solo                haproxy-node3-fbffdb64-272t2                                   ●  1/1   Running         1 1 │
│ solo                minio-pool-1-0                                                 ●  2/2   Running         1 1 │
│ solo                network-node1-0                                                ●  5/5   Running         2 1 │
│ solo                network-node2-0                                                ●  5/5   Running         2 1 │
│ solo                network-node3-0                                                ●  5/5   Running         2 1 │
│ solo                relay-node1-node2-node3-hedera-json-rpc-relay-ddd4c8d8b-hdlpb  ●  1/1   Running         0 1 │
│ solo-cluster        console-557956d575-c5qp7                                       ●  1/1   Running         0 1 │
│ solo-cluster        minio-operator-7d575c5f84-xdwwz                                ●  1/1   Running         0 1 │
│                                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
