---
title: "Solo User Guide"
weight: 20
description: >
  Learn how to set up your first Hedera test network using Solo. This step-by-step guide covers installation, deployment, and your first transaction.
type: docs
---

> 📝 For less than 16 GB of memory to dedicate to Docker please skip the block node add and destroy steps.

> 📝 There should be a table of contents on the right side of your screen if your browser width is large enough

## Introduction
Welcome to the world of Hedera development! If you're looking to build and test applications on the Hedera network but don't want to spend HBAR on testnet or mainnet transactions, you've come to the right place. Solo is your gateway to running your own local Hedera test network, giving you complete control over your development environment.

Solo is an opinionated command-line interface (CLI) tool designed to deploy and manage standalone Hedera test networks. Think of it as your personal Hedera sandbox where you can experiment, test features, and develop applications without any external dependencies or costs. Whether you're building smart contracts, testing consensus mechanisms, or developing DApps, Solo provides the infrastructure you need.

By the end of this tutorial, you'll have your own Hedera test network running locally, complete with consensus nodes, mirror nodes, and all the infrastructure needed to submit transactions and test your applications. Let's dive in!

## Prerequisites

Before we begin, let's ensure your system meets the requirements and has all the necessary software installed. Don't worry if this seems like a lot – we'll walk through each step together.

### System Requirements(for a bare minimum install running 1 node)

First, check that your computer meets these minimum specifications:

- **Memory**: At least 8GB of RAM (16GB recommended for smoother performance)
- **CPU**: Minimum 4 cores (8 cores recommended)
- **Storage**: At least 20GB of free disk space
- **Operating System**: macOS, Linux, or Windows with WSL2

### Required Software

You'll need to install a few tools before we can set up Solo. Here's what you need and how to get it:

### 1. Node.js (≥20.18.0)

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Solo is built on Node.js, so you'll need version 20.18.0 or higher. We recommend using Node Version Manager (nvm) for easy version management:

```bash

bash
# Install nvm (macOS/Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install nvm (Windows - use nvm-windows)# Download from: https://github.com/coreybutler/nvm-windows# Install Node.js
nvm install 20.18.0
nvm use 20.18.0

# Verify installation
node --version

```

{{< /details >}}

### 2. Docker Desktop

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Docker is essential for running the containerized Hedera network components:

- **macOS/Windows**: Download Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop)
- **Linux**: Follow the installation guide for your distribution at [docs.docker.com](https://docs.docker.com/engine/install/)

After installation, ensure Docker is running:

```bash
bash
docker --version
docker ps
```

{{< /details >}}

## Step-by-Step Installation

Now that we have all prerequisites in place, let's install Solo and set up our environment.

One thing to consider, old installs can really hamper your ability to get a new install up and running. If you have an old install of Solo, or if you are having issues with the install, please run the following commands to clean up your environment before proceeding.

### 1. Installing Solo

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Open your terminal and install Solo globally using npm:

```bash
npm install -g @hashgraph/solo

# Verify the installation
solo --version
```

You should see output showing the latest version which should match our NPM package version: <https://www.npmjs.com/package/@hashgraph/solo>

{{< /details >}}

### *Cleaning up an old install

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

The team is presently working on a number of fixes and automation that will relegate the need for this, but currently as deployed Solo can be finnicky with artifacts from prior installs. A quick command to prep your station for a new install is a good idea.

```bash
for cluster in $(kind get clusters);do;kind delete cluster -n $cluster;done
rm -Rf ~/.solo
```

{{< /details >}}

### 2. Setting up your environmental variables

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

You need to declare some environmental variables. Keep note that unless you intentionally include these in your zsh config when you close your terminal you may lose them.

*throughout the remainder of this walkthrough for simplicity sake I will assume in commands these are the values in your .env

```bash
export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_DEPLOYMENT=solo-deployment
```

{{< /details >}}

### 3. Create a cluster

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

```bash
kind create cluster -n solo
```

{{< /details >}}

### *Connecting to a remote cluster

{{< details summary="Details <click to expand/collapse>" >}}<br/>

* You may use a remote Kubernetes cluster. In this case, ensure Kubernetes context is set up correctly.

```bash
kubectl config get-contexts
kubectl config use-context <context-name>
```

{{< /details >}}

### 4. Initialize solo:

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

```bash
bash
# reset .solo directory before initializing 
solo init
```

{{< /details >}}

### 5. Connect the cluster and create a deployment

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

This command will create a deployment in the specified clusters, and generate the LocalConfig and RemoteConfig used by k8s.

The deployment will:

- Create a namespace (usually matching the deployment name)
- Set up ConfigMaps and secrets
- Deploy network infrastructure
- Create persistent volumes if needed

> 📝 notice that the `--cluster-ref` value is `kind-solo`, when you created the Kind cluster it created a cluster reference in the Kubernetes config with the name `kind-solo`. If you used a different name, replace `kind-solo` with your cluster name, but prefixing with `kind-`.  If you are working with a remote cluster, you can use the name of your cluster reference which can be gathered with the command: `kubectl config get-contexts`.

```bash
# connect to the cluster you created in a previous command
solo cluster-ref connect --cluster-ref kind-solo

#create the deployment
solo deployment create -n solo --deployment solo-deployment
```

> 📝 Note: Solo stores various artifacts (config, logs, keys etc.) in its home directory: ~/.solo. If you need a full reset, delete this directory before running solo init ag
>

{{< /details >}}

### 6. Add a cluster to the deployment you created

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

*This command is the first command that will specify how many nodes you want to add to your deployment. For the sake of resource

```bash
# Add a cluster to the deployment you created
solo deployment add-cluster --deployment solo-deployment --cluster-ref solo-cluster --num-consensus-nodes 1
# If the command line command is unresponsive there's also a handy cluster add configurator you can run
solo deployment add-cluster
```

{{< /details >}}

### 7. Generate keys

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

You need to generate keys for your nodes, or in this case single node. 

```bash
solo node keys --gossip-keys --tls-keys --deployment solo-deployment
```

{{< /details >}}

### 8. Setup cluster with shared components

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

```bash
solo cluster-ref setup -s solo-cluster
```

{{< /details >}}

## Deploying Helm chart with network components

Now comes the exciting part – deploying your Hedera test network!

### 1. Deploy the network

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Deploying the network runs risks of timeouts as images are downloaded, and pods are starting. If you experience a failure double check the resources you've allocated in docker engine and give it another try.

```bash
solo network deploy --deployment solo-deployment
```

{{< /details >}}

### 2. Setup node with Hedera platform software

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

This step downloads the hedera platform code and sets up your node/nodes. *note you can add additional nodes here make sure they match the number of nodes associated with previous commands.

```bash
# node setup
solo node setup --deployment solo-deployment

```

{{< /details >}}

### 3. Start the nodes up!

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Now that everything is set up you need to start them.

```bash
bash
# start your node/nodes 
solo node start --deployment solo-deployment
```

{{< /details >}}

### 4. Deploy a mirror node

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

This is the most memory intensive step from a resource perspective. If you have issues at this step try checking your local resource utilization and make sure there's memory available for docker (close all unessential applications). Likewise, you can consider lowering your swap in docker settings to ease the swap demand, and try again.

```bash
bash
# Deploy with explicit configuration
solo mirror-node deploy --deployment solo-deployment --cluster-ref kind-solo-cluster
```

{{< /details >}}

### 5. Explorer mode

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Watch the deployment progress:

```bash
# deploy explorer
solo explorer deploy --deployment solo-deployment --cluster-ref kind-solo-cluster
```

{{< /details >}}

### 6. Deploy a JSON RPC relay

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

The JSON RPC relay allows you to interact with your Hedera network using standard JSON RPC calls. This is useful for integrating with existing tools and libraries.

```bash
#deploy a solo JSON RPC relay
solo relay deploy -i node1 --deployment solo-deployment
```

{{< /details >}}

### *Check Pod Status

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Here is a command if you want to check the status of your Solo Kubernetes pods:

```bash
# Check pod status
kubectl get pods -n solo
```

{{< /details >}}

## Working with Your Network

### Network Endpoints

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

At this time Solo doesn't automatically set up port forwarding for you, so you'll need to do that manually. 

The port forwarding can be done using `kubectl port-forward` command. For example, to forward the consensus service port:

```bash
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
```

{{< /details >}}

### ❌ BELOW THIS LINE IS A WORK IN PROGRESS VENTURE AT YOUR OWN RISK

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Connecting with the Hedera SDK

Here's a simple example to connect to your local network:

```javascript
// test-connection.js
const { Client, AccountBalanceQuery } = require("@hashgraph/sdk");

async function main() {
// Create client for local network
    const client = Client.forNetwork({
        "127.0.0.1:50211": "0.0.3"
    });

// Set operator (treasury account for local network)
    client.setOperator("0.0.2", "302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137");

// Query account balance
    const balance = await new AccountBalanceQuery()
        .setAccountId("0.0.2")
        .execute(client);

    console.log("Account balance:", balance.hbars.toString());
}

main().catch(console.error);
```

{{< /details >}}

### Submitting Transactions

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Create and submit your first transaction:

```javascript
// submit-transaction.js
const {
    Client,
    TransferTransaction,
    Hbar,
    PrivateKey
} = require("@hashgraph/sdk");

async function main() {
// Setup client (same as above)
    const client = Client.forNetwork({
        "127.0.0.1:50211": "0.0.3"
    });

    const treasuryKey = PrivateKey.fromString("302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137");
    client.setOperator("0.0.2", treasuryKey);

// Create new account
    const newAccountPrivateKey = PrivateKey.generateED25519();
    const newAccountPublicKey = newAccountPrivateKey.publicKey;

// Create transaction
    const transaction = await new TransferTransaction()
        .addHbarTransfer("0.0.2", new Hbar(-10))
        .addHbarTransfer("0.0.1001", new Hbar(10))
        .execute(client);

// Get receipt
    const receipt = await transaction.getReceipt(client);

    console.log("Transaction status:", receipt.status.toString());
}

main().catch(console.error);
```

{{< /details >}}

## Managing Your Network

### Stopping and Starting Nodes

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

You can control individual nodes or the entire network:

```bash
bash
# Stop all nodes
solo node stop --deployment solo-deployment

# Stop a specific node
solo node stop --node-id node-0 --deployment solo-deployment

# Restart nodes
solo node restart --deployment solo-deployment

# Start nodes again
solo node start --deployment solo-deployment
```

{{< /details >}}

### Viewing Logs

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Access Solo and Consensus Node logs for troubleshooting:

```bash 
# Download logs from all nodes

# Logs are saved to ~/.solo/logs/<namespace>/<pod-name>/# You can also use kubectl directly:
solo node logs --node-aliases node1 --deployment solo-deployment
```

{{< /details >}}

### Updating the Network

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

To update nodes to a new Hedera version, you need up upgrade to one minor version higher at a time:

```bash
solo node upgrade --deployment solo-deployment --upgrade-version v0.62.6
```

{{< /details >}}

## Troubleshooting: Common Issues and Solutions

### 1. Pods Not Starting

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

If pods remain in `Pending` or `CrashLoopBackOff` state:

```bash
# Check pod events
kubectl describe pod -n solo network-node-0

# Common fixes:# - Increase Docker resources (memory/CPU)# - Check disk space# - Restart Docker and kind cluster
```

{{< /details >}}

### 2. Connection Refused Errors

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

If you can't connect to network endpoints:

```bash
# Check service endpoints
kubectl get svc -n solo

# Manually forward ports if needed
kubectl port-forward -n solo svc/network-node-0 50211:50211
```

{{< /details >}}

### 3. Node Synchronization Issues

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

If nodes aren't forming consensus:

```bash
# Check node status
solo node states --deployment solo-deployment --node-aliases node1

# Look for gossip connectivity issues
kubectl logs -n solo network-node-0 | grep -i gossip

# Restart problematic nodes
solo node refresh --node-aliases node1 --deployment solo-deployment
```

{{< /details >}}

## Getting Help

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

When you need assistance:

1. **Check the logs**: Use `solo node logs --deployment solo-deployment --node-aliases node1` and examine `~/.solo/logs/`
2. **Documentation**: Visit https://solo.hiero.org/latest/docs/
3. **GitHub Issues**: Report bugs at https://github.com/hiero-ledger/solo/issues
4. **Community Support**: Join the Hedera Discord community: https://discord.gg/Ysruf53q

{{< /details >}}

## Cleanup

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

When you're done with your test network:

```bash
# Destroy the network (keeps cluster)
solo network destroy --deployment solo-deployment

# Remove all persistent data
solo network destroy --deployment solo-deployment --delete-pvcs --delete-secrets

# Delete the entire kind cluster
kind delete cluster --name solo
```

{{< /details >}}

## Next Steps

{{< details summary="Details <click to expand/collapse>" open=true >}}<br/>

Congratulations! You now have a working Hedera test network. Here are some suggestions for what to explore next:

1. **Deploy Smart Contracts**: Test your Solidity contracts on the local network
2. **Mirror Node Queries**: Explore the REST API at `http://localhost:5551`
3. **Multi-Node Testing**: Add more nodes to test scalability
4. **Network Upgrades**: Practice upgrading the Hedera platform version
5. **Integration Testing**: Connect your applications to the local network

Remember, this is your personal Hedera playground. Experiment freely, break things, learn, and have fun building on Hedera!

Happy coding with Solo! 🚀

{{< /details >}}

### Create a local cluster

{{< details >}}

* You may use [kind](https://kind.sigs.k8s.io/) or [microk8s](https://microk8s.io/) to create a cluster. In this case,
  ensure your Docker engine has enough resources (e.g. Memory >=8Gb, CPU: >=4). Below we show how you can use `kind` to create a cluster

First, use the following command to set up the environment variables:

```bash
export SOLO_CLUSTER_NAME=solo-cluster
export SOLO_NAMESPACE=solo-e2e
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster-setup
export SOLO_DEPLOYMENT=solo-deployment

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

[Go to Table of Contents](#table-of-contents) 
{.goToTableOfContents font-size=smaller, vertical-align=sub}

{{< /details >}}

## Step-by-Step Instructions

### Initialize `solo` directories:

{{< details >}}

```bash
# reset .solo directory
rm -rf ~/.solo

solo init
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
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
✔ Create local configuration
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

[Go to Table of Contents](#table-of-contents)
{.goToTableOfContents font-size=smaller, vertical-align=sub}

{{< /details >}}

### Create a deployment in the specified clusters, generate RemoteConfig and LocalConfig objects.

#### Associates a cluster reference to a k8s context

{{< details >}}

```bash
solo cluster-ref connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}
```

* Example output

```
******************************* Solo *********************************************
Version			: 0.37.1
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

[Go to Table of Contents](#table-of-contents)
{.goToTableOfContents font-size=smaller, vertical-align=sub}

{{< /details >}}

#### Create a deployment

{{< details >}}

```bash
solo deployment create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: deployment create --namespace solo-e2e --deployment solo-deployment --realm 0 --shard 0
Kubernetes Namespace	: solo-e2e
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Add deployment to local config
✔ Adding deployment: solo-deployment with namespace: solo-e2e to local config
```

[Go to Table of Contents](#table-of-contents)
{.goToTableOfContents font-size=smaller, vertical-align=sub}

{{< /details >}}

* Add a cluster to deployment

```
solo deployment add-cluster --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 3
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: deployment add-cluster --deployment solo-deployment --cluster-ref kind-solo-e2e --num-consensus-nodes 1
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Verify args
✔ Verify args
❯ check ledger phase
✔ check ledger phase
❯ Test cluster connection
✔ Test cluster connection: kind-solo-e2e, context: kind-solo-e2e
❯ Verify prerequisites
✔ Verify prerequisites
❯ add cluster-ref in local config deployments
✔ add cluster-ref: kind-solo-e2e for deployment: solo-deployment in local config
❯ create remote config for deployment
✔ create remote config for deployment: solo-deployment in cluster: kind-solo-e2e
```

### Generate `pem` formatted node keys

```
solo node keys --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: node keys --gossip-keys --tls-keys --deployment solo-deployment
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Generate gossip keys
❯ Backup old files
✔ Backup old files
❯ Gossip key for node: node1
✔ Gossip key for node: node1
✔ Generate gossip keys
❯ Generate gRPC TLS Keys
❯ Backup old files
❯ TLS key for node: node1
✔ Backup old files
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

### Setup cluster with shared components

```
solo cluster-ref setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: cluster-ref setup --cluster-setup-namespace solo-cluster-setup
**********************************************************************************
❯ Initialize
✔ Initialize
❯ Prepare chart values
✔ Prepare chart values
❯ Install 'solo-cluster-setup' chart
********************** Installed solo-cluster-setup chart **********************
Version			: 0.53.0
********************************************************************************
✔ Install 'solo-cluster-setup' chart
```

In a separate terminal, you may run `k9s` to view the pod status.

### Deploy a block node

```
solo block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: block node add --deployment solo-deployment --cluster-ref kind-solo-e2e --release-tag v0.62.6
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Prepare release name
✔ Prepare release name
❯ Prepare chart values
✔ Prepare chart values
❯ Deploy block node
************************* Installed block-node-0 chart *************************
Version			: 0.9.0
********************************************************************************
✔ Deploy block node
❯ Check block node pod is running
✔ Check block node pod is running
❯ Check software
✔ Check software
❯ Check block node pod is ready
✔ Check block node pod is ready
❯ Check block node readiness
✔ Check block node readiness - [1/100] success
❯ Add block node component in remote config
✔ Add block node component in remote config
```

### Deploy helm chart with Hedera network components

It may take a while (5~15 minutes depending on your internet speed) to download various docker images and get the pods started.

If it fails, ensure you have enough resources allocated for Docker engine and retry the command.

```
solo network deploy --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: network deploy --deployment solo-deployment
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
❯ Copy Gossip keys
✔ Copy TLS keys
✔ Copy Gossip keys
✔ Node: node1, cluster: kind-solo-e2e
✔ Copy node keys to secrets
❯ Install chart 'solo-deployment'
*********************** Installed solo-deployment chart ************************
Version			: 0.53.0
********************************************************************************
✔ Install chart 'solo-deployment'
❯ Check for load balancer
↓ Check for load balancer [SKIPPED: Check for load balancer]
❯ Redeploy chart with external IP address config
↓ Redeploy chart with external IP address config [SKIPPED: Redeploy chart with external IP address config]
❯ Check node pods are running
❯ Check Node: node1, Cluster: kind-solo-e2e
✔ Check Node: node1, Cluster: kind-solo-e2e
✔ Check node pods are running
❯ Check proxy pods are running
❯ Check HAProxy for: node1, cluster: kind-solo-e2e
❯ Check Envoy Proxy for: node1, cluster: kind-solo-e2e
✔ Check Envoy Proxy for: node1, cluster: kind-solo-e2e
✔ Check HAProxy for: node1, cluster: kind-solo-e2e
✔ Check proxy pods are running
❯ Check auxiliary pods are ready
❯ Check MinIO
✔ Check MinIO
✔ Check auxiliary pods are ready
❯ Add node and proxies to remote config
✔ Add node and proxies to remote config
❯ Copy block-nodes.json
✔ Copy block-nodes.json
```

### Setup node with Hedera platform software.

* It may take a while as it download the hedera platform code from <https://builds.hedera.com/>

```
solo node setup --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: node setup --deployment solo-deployment --release-tag v0.62.6
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Validate nodes states
❯ Validating state for node node1
✔ Validating state for node node1 - valid state: requested
✔ Validate nodes states
❯ Identify network pods
❯ Check network pod: node1
✔ Check network pod: node1
✔ Identify network pods
❯ Fetch platform software into network nodes
❯ Update node: node1 [ platformVersion = v0.62.6, context = kind-solo-e2e ]
✔ Update node: node1 [ platformVersion = v0.62.6, context = kind-solo-e2e ]
✔ Fetch platform software into network nodes
❯ Setup network nodes
❯ Node: node1
❯ Copy configuration files
✔ Copy configuration files
❯ Set file permissions
✔ Set file permissions
✔ Node: node1
✔ Setup network nodes
❯ Change node state to configured in remote config
✔ Change node state to configured in remote config
```

* Start the nodes

```
solo node start --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: node start --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Validate nodes states
❯ Validating state for node node1
✔ Validating state for node node1 - valid state: configured
✔ Validate nodes states
❯ Identify existing network nodes
❯ Check network pod: node1
✔ Check network pod: node1
✔ Identify existing network nodes
❯ Upload state files network nodes
↓ Upload state files network nodes [SKIPPED: Upload state files network nodes]
❯ Starting nodes
❯ Start node: node1
✔ Start node: node1
✔ Starting nodes
❯ Enable port forwarding for JVM debugger
↓ Enable port forwarding for JVM debugger [SKIPPED: Enable port forwarding for JVM debugger]
❯ Check all nodes are ACTIVE
❯ Check network pod: node1 
✔ Check network pod: node1  - status ACTIVE, attempt: 16/300
✔ Check all nodes are ACTIVE
❯ Check node proxies are ACTIVE
❯ Check proxy for node: node1
✔ Check proxy for node: node1
✔ Check node proxies are ACTIVE
❯ Change node state to started in remote config
✔ Change node state to started in remote config
❯ Add node stakes
❯ Adding stake for node: node1
✔ Adding stake for node: node1
✔ Add node stakes
```

***

### Deploy mirror node

```
solo mirror-node deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
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
Version			: v0.129.1
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
✔ Check Monitor
✔ Check GRPC
✔ Check Importer
✔ Check REST API
✔ Check pods are ready
❯ Seed DB data
❯ Insert data in public.file_data
✔ Insert data in public.file_data
✔ Seed DB data
❯ Add mirror node to remote config
✔ Add mirror node to remote config
```

### Deploy explorer mode

```
solo explorer deploy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: explorer deploy --deployment solo-deployment --cluster-ref kind-solo-e2e --quiet-mode
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
************************ Installed hiero-explorer chart ************************
Version			: 24.15.0
********************************************************************************
✔ Install explorer
❯ Install explorer ingress controller
↓ Install explorer ingress controller [SKIPPED: Install explorer ingress controller]
❯ Check explorer pod is ready
✔ Check explorer pod is ready
❯ Check haproxy ingress controller pod is ready
↓ Check haproxy ingress controller pod is ready [SKIPPED: Check haproxy ingress controller pod is ready]
❯ Add explorer to remote config
✔ Add explorer to remote config
```

### Deploy a JSON RPC relay

```
solo relay deploy -i node1 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: relay deploy --node-aliases node1 --deployment solo-deployment
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
************************* Installed relay-node1 chart **************************
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

### Execution Developer

Next: [Execution Developer](execution-developer)

### Destroy relay node

```
solo relay destroy -i node1 --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: relay destroy --node-aliases node1 --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Destroy JSON RPC Relay

 *** Destroyed Relays ***
-------------------------------------------------------------------------------
 - block-node-0 [block-node-helm-chart-0.9.0]
 - hiero-explorer [hiero-explorer-chart-24.15.0]
 - mirror [hedera-mirror-0.129.1]
 - solo-deployment [solo-deployment-0.53.0]


✔ Destroy JSON RPC Relay
❯ Remove relay component from remote config
✔ Remove relay component from remote config
```

### Destroy mirror node

```
solo mirror-node destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
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

### Destroy explorer node

```
solo explorer destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
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
✔ Remove explorer from remote config
```

### Destroy network

```
solo network destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
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
✔ Deleting the RemoteConfig configmap in namespace solo-e2e
```

### Destroy block node

```
solo block node destroy --deployment "${SOLO_DEPLOYMENT}"
```

* Example output

```

******************************* Solo *********************************************
Version			: 0.37.1
Kubernetes Context	: kind-solo-e2e
Kubernetes Cluster	: kind-solo-e2e
Current Command		: block node destroy --deployment solo-deployment
**********************************************************************************
❯ Initialize
❯ Acquire lock
✔ Acquire lock - lock acquired successfully, attempt: 1/10
✔ Initialize
❯ Look-up block node
✔ Look-up block node
❯ Destroy block node
✔ Destroy block node
❯ Disable block node component in remote config
✔ Disable block node component in remote config
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
│ solo                solo-deployment-hiero-explorer-6565ccb4cb-9dbw2          ●  1/1   Running         0 1 │
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
