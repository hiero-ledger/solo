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

* **Memory**: At least 12GB of RAM (16GB recommended for smoother performance)
* **CPU**: Minimum 4 cores (8 cores recommended)
* **Storage**: At least 20GB of free disk space
* **Operating System**: macOS, Linux, or Windows with WSL2

### Required Software

You'll need to install a few tools before we can set up Solo. Here's what you need and how to get it:

### 1. Node.js (≥20.18.0)

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Solo is built on Node.js, so you'll need version 20.18.0 or higher. We recommend using Node Version Manager (nvm) for easy version management:

```bash
# Install nvm (macOS/Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install nvm (Windows - use nvm-windows)# Download from: https://github.com/coreybutler/nvm-windows# Install Node.js
nvm install 20.18.0
nvm use 20.18.0

# Verify installation
node --version

```

{{< /details >}}<br/>

### 2. Docker Desktop

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Docker is essential for running the containerized Hedera network components:

* **macOS/Windows**: Download Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop)
* **Linux**: Follow the installation guide for your distribution at [docs.docker.com](https://docs.docker.com/engine/install/)

After installation, ensure Docker is running:

```bash
docker --version
docker ps
```

{{< /details >}}<br/>

## Preparing Your Environment

Now that we have all prerequisites in place, let's install Solo and set up our environment.

One thing to consider, old installs can really hamper your ability to get a new install up and running. If you have an old install of Solo, or if you are having issues with the install, please run the following commands to clean up your environment before proceeding.

### 1. Installing Solo

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Open your terminal and install Solo globally using npm:

```bash
npx @hashgraph/solo

# Verify the installation
solo --version
```

You should see output showing the latest version which should match our NPM package version: <https://www.npmjs.com/package/@hashgraph/solo>

{{< /details >}}<br/>

### \*Cleaning up an old install

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

The team is presently working on a number of fixes and automation that will relegate the need for this, but currently as deployed Solo can be finnicky with artifacts from prior installs. A quick command to prep your station for a new install is a good idea.

```bash
for cluster in $(kind get clusters);do kind delete cluster -n $cluster;done
rm -Rf ~/.solo
```

{{< /details >}}<br/>

### 2. Setting up your environmental variables

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

You need to declare some environmental variables. Keep note that unless you intentionally include these in your zsh config when you close your terminal you may lose them.

\*throughout the remainder of this walkthrough for simplicity sake I will assume in commands these are the values in your .env

```bash
export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_DEPLOYMENT=solo-deployment
```

{{< /details >}}<br/>

### 3. Create a cluster

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

```bash
kind create cluster -n "${SOLO_CLUSTER_NAME}"
```

Example output:

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

{{< /details >}}<br/>

### \*Connecting to a remote cluster

{{< details summary="Details \<click to expand/collapse>" >}}<br/>

* You may use a remote Kubernetes cluster. In this case, ensure Kubernetes context is set up correctly.

```bash
kubectl config get-contexts
kubectl config use-context <context-name>
```

{{< /details >}}<br/>

## One Shot Deployment

For a simple setup with a single node with a mirror node, explorer, and JSON RPC relay, you can follow these quick steps. This is ideal for testing and development purposes.

```bash
solo one-shot single deploy
```

When you're finished, you can tear down your Solo network just as easily:

```bash
solo one-shot single destroy
```

## Step-by-Step Solo Network Deployment

If you have a more complex setup in mind, such as multiple nodes or specific configurations, follow these detailed steps to deploy your Solo network.

### 1. Initialize solo:

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Reset the `.solo` directory before initializing Solo. This step is crucial to ensure a clean setup without any leftover artifacts from previous installations. See: [\*Cleaning up an old install](#cleaning-up-an-old-install)

```bash
solo init
```

Example output:

```
$SOLO_INIT_OUTPUT
```

{{< /details >}}<br/>

### 2. Connect the cluster and create a deployment

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

This command will create a deployment in the specified clusters, and generate the LocalConfig and RemoteConfig used by k8s.

The deployment will:

* Create a namespace (usually matching the deployment name)
* Set up ConfigMaps and secrets
* Deploy network infrastructure
* Create persistent volumes if needed

> 📝 notice that the `--cluster-ref` value is `kind-solo`, when you created the Kind cluster it created a cluster reference in the Kubernetes config with the name `kind-solo`. If you used a different name, replace `kind-solo` with your cluster name, but prefixing with `kind-`.  If you are working with a remote cluster, you can use the name of your cluster reference which can be gathered with the command: `kubectl config get-contexts`.
> 📝 Note: Solo stores various artifacts (config, logs, keys etc.) in its home directory: ~/.solo. If you need a full reset, delete this directory before running solo init ag

```bash
# connect to the cluster you created in a previous command
solo cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}

#create the deployment
solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```
$SOLO_CLUSTER_REF_CONNECT_OUTPUT
```

```
$SOLO_DEPLOYMENT_CREATE_OUTPUT
```

{{< /details >}}<br/>

### 3. Add a cluster to the deployment you created

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

\*This command is the first command that will specify how many nodes you want to add to your deployment. For the sake of resource

```bash
# Add a cluster to the deployment you created
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1
# If the command line command is unresponsive there's also a handy cluster add configurator you can run `solo deployment cluster attach` without any arguments to get a guided setup.
```

Example output:

```
$SOLO_DEPLOYMENT_ADD_CLUSTER_OUTPUT
```

{{< /details >}}<br/>

### 4. Generate keys

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

You need to generate keys for your nodes, or in this case single node.

```bash
solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```
$SOLO_NODE_KEY_PEM_OUTPUT
```

PEM key files are generated in `~/.solo/cache/keys` directory.

```
hedera-node1.crt    hedera-node3.crt    s-private-node1.pem s-public-node1.pem  unused-gossip-pem
hedera-node1.key    hedera-node3.key    s-private-node2.pem s-public-node2.pem  unused-tls
hedera-node2.crt    hedera-node4.crt    s-private-node3.pem s-public-node3.pem
hedera-node2.key    hedera-node4.key    s-private-node4.pem s-public-node4.pem
```

{{< /details >}}<br/>

### 5. Setup cluster with shared components

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

```bash
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
```

Example output:

```
$SOLO_CLUSTER_SETUP_OUTPUT
```

{{< /details >}}<br/>

## Deploying Helm chart with network components

Now comes the exciting part – deploying your Hedera test network!

### \*Deploy a block node (experimental)

{{< details summary="Details \<click to expand/collapse>" >}}<br/>

> ⚠️ Block Node is experimental in Solo.  It requires a minimum of 16 GB of memory allocated to Docker. If you have less than 16 GB of memory, skip this step.

As mentioned in the warning, Block Node uses a lot of memory.  In addition, it requires a version of Consensus Node to be at least v0.62.3.  You will need to augment the `solo consensus network deploy` & `solo consensus node setup` command with the `--release-tag v0.62.6` option to ensure that the Consensus Node is at the correct version. \*note: v0.62.6 is the latest patch for v0.62

```
solo block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" --release-tag v0.62.6
```

Example output:

```
$SOLO_BLOCK_NODE_ADD_OUTPUT
```

{{< /details >}}<br/>

### 1. Deploy the network

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Deploying the network runs risks of timeouts as images are downloaded, and pods are starting. If you experience a failure double check the resources you've allocated in docker engine and give it another try.

```bash
solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```
$SOLO_NETWORK_DEPLOY_OUTPUT
```

{{< /details >}}<br/>

### 2. Set up a node with Hedera platform software

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

This step downloads the hedera platform code and sets up your node/nodes.

```bash
# consensus node setup
export CONSENSUS_NODE_VERSION=v0.65.1 # or whatever version you are trying to deploy starting with a `v`
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}"
```

Example output:

```
$SOLO_NODE_SETUP_OUTPUT
```

{{< /details >}}<br/>

### 3. Start the nodes up!

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Now that everything is set up you need to start them.

```bash
# start your node/nodes
solo consensus node start --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```
$SOLO_NODE_START_OUTPUT
```

{{< /details >}}<br/>

### 4. Deploy a mirror node

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

This is the most memory intensive step from a resource perspective. If you have issues at this step try checking your local resource utilization and make sure there's memory available for docker (close all unessential applications). Likewise, you can consider lowering your swap in docker settings to ease the swap demand, and try again.

The `--pinger` flag starts a pinging service that sends transactions to the network at regular intervals. This is needed because the record file is not imported into the mirror node until the next one is created.

```bash
# Deploy with explicit configuration
solo mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress --pinger
```

Example output:

```
$SOLO_MIRROR_NODE_DEPLOY_OUTPUT
```

{{< /details >}}<br/>

### 5. Deploy the explorer

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Watch the deployment progress:

```bash
# deploy explorer
solo explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
```

Example output:

```
$SOLO_EXPLORER_DEPLOY_OUTPUT
```

{{< /details >}}<br/>

### 6. Deploy a JSON RPC relay

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

The JSON RPC relay allows you to interact with your Hedera network using standard JSON RPC calls. This is useful for integrating with existing tools and libraries.

```bash
#deploy a solo JSON RPC relay
solo relay node add -i node1 --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```
$SOLO_RELAY_DEPLOY_OUTPUT
```

{{< /details >}}<br/>

### \*Check Pod Status

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Here is a command if you want to check the status of your Solo Kubernetes pods:

```bash
# Check pod status
kubectl get pods -n solo
```

{{< /details >}}<br/>

## Working with Your Network

### Network Endpoints

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

At this time Solo doesn't automatically set up port forwarding for you, so you'll need to do that manually.

The port forwarding is now automatic for many endpoints.  However, you can set up your own using `kubectl port-forward` command:

```bash
# Consensus Service for node1 (node ID = 0): localhost:50211
# should be automatic: kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 > /dev/null 2>&1 &
# Explorer UI: http://localhost:8080
# should be automatic: kubectl port-forward svc/hiero-explorer -n "${SOLO_NAMESPACE}" 8080:8080 > /dev/null 2>&1 &
# Mirror Node gRPC, REST, REST Java, Web3 will be automatic on `localhost:8081` if you passed `--enable-ingress` to the `solo mirror node add` command
# Mirror Node gRPC: localhost:5600
kubectl port-forward svc/mirror-1-grpc -n "${SOLO_NAMESPACE}" 5600:5600 > /dev/null 2>&1 &
# Mirror Node REST API: http://localhost:5551
kubectl port-forward svc/mirror-1-rest -n "${SOLO_NAMESPACE}" 5551:80 > /dev/null 2>&1 &
# Mirror Node REST Java API http://localhost:8084
kubectl port-forward svc/mirror-1-restjava -n "${SOLO_NAMESPACE}" 8084:80 > /dev/null 2>&1 &
# JSON RPC Relay: localhost:7546
# should be automatic: kubectl port-forward svc/relay-node1-hedera-json-rpc-relay -n "${SOLO_NAMESPACE}" 7546:7546 > /dev/null 2>&1 &
```

{{< /details >}}<br/>

## Managing Your Network

### Stopping and Starting Nodes

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

You can control individual nodes or the entire network:

```bash
# Stop all nodes
solo consensus node stop --deployment solo-deployment

# Stop a specific node
solo consensus node stop --node-id node-0 --deployment solo-deployment

# Restart nodes
solo consensus node restart --deployment solo-deployment

# Start nodes again
solo consensus node start --deployment solo-deployment
```

{{< /details >}}<br/>

### Viewing Logs

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Access Solo and Consensus Node logs for troubleshooting:

```bash
# Download logs from all nodes

# Logs are saved to ~/.solo/logs/<namespace>/<pod-name>/# You can also use kubectl directly:
solo consensus diagnostics all --deployment solo-deployment
```

{{< /details >}}<br/>

### Updating the Network

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

To update nodes to a new Hedera version, you need to upgrade by one minor version higher at a time:

```bash
solo consensus network upgrade --deployment solo-deployment --upgrade-version v0.62.6
```

{{< /details >}}<br/>

### Updating a single node

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

To update a single node to a new Hedera version, you need to update by one minor version higher at a time:

```bash
solo consensus node update --deployment solo-deployment --node-alias node1 --release-tag v0.62.6
```

It is possible to update a single node to a new Hedera version through a process with separated steps. This is only useful in very specific cases, such as when testing the updating process.

```bash
solo consensus dev-node-update prepare --deployment solo-deployment --node-alias node1 --release-tag v0.62.6 --output-dir context
solo consensus dev-node-update submit-transaction --deployment solo-deployment --input-dir context
solo consensus dev-node-update execute --deployment solo-deployment --input-dir context
```

{{< /details >}}<br/>

### Adding a new node to the network

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Adding a new node to an existing Solo network:

```bash
TODO solo consensus node add
```

It is possible to add a new node through a process with separated steps. This is only useful in very specific cases, such as when testing the node adding process.

```bash
solo consensus dev-node-add prepare --gossip-keys true --tls-keys true --deployment solo-deployment --pvcs true --admin-key ***** --node-alias node1 --output-dir context
solo consensus dev-node-add submit-transaction --deployment solo-deployment --input-dir context
solo consensus dev-node-add execute --deployment solo-deployment --input-dir context
```

{{< /details >}}<br/>

### Deleting a node from the network

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

This command is used to delete a node from an existing Solo network:

```bash
TODO solo consensus node destroy
```

It is possible to delete a node through a process with separated steps. This is only useful in very specific cases, such as when testing the delete process.

```bash
solo consensus dev-node-delete prepare --deployment solo-deployment --node-alias node1 --output-dir context
solo consensus dev-node-delete submit-transaction --deployment solo-deployment --input-dir context
solo consensus dev-node-delete execute --deployment solo-deployment --input-dir context
```

{{< /details >}}<br/>

## Troubleshooting: Common Issues and Solutions

### 1. Pods Not Starting

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

If pods remain in `Pending` or `CrashLoopBackOff` state:

```bash
# Check pod events
kubectl describe pod -n solo network-node-0

# Common fixes:# - Increase Docker resources (memory/CPU)# - Check disk space# - Restart Docker and kind cluster
```

{{< /details >}}<br/>

### 2. Connection Refused Errors

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

If you can't connect to network endpoints:

```bash
# Check service endpoints
kubectl get svc -n solo

# Manually forward ports if needed
kubectl port-forward -n solo svc/network-node-0 50211:50211
```

{{< /details >}}<br/>

### 3. Node Synchronization Issues

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

If nodes aren't forming consensus:

```bash
# Check node status
solo consensus state download --deployment solo-deployment --node-aliases node1

# Look for gossip connectivity issues
kubectl logs -n solo network-node-0 | grep -i gossip

# Restart problematic nodes
solo consensus node refresh --node-aliases node1 --deployment solo-deployment
```

{{< /details >}}<br/>

## Getting Help

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

When you need assistance:

1. **Check the logs**: Use `solo consensus diagnostics all --deployment solo-deployment` and examine `~/.solo/logs/`
2. **Documentation**: Visit [https://solo.hiero.org/main/docs/](docs/_index.md)
3. **GitHub Issues**: Report bugs at https://github.com/hiero-ledger/solo/issues
4. **Community Support**: Join the Hedera Discord community: https://discord.gg/Ysruf53q

{{< /details >}}<br/>

## Cleanup

{{< details summary="Details \<click to expand/collapse>" >}}<br/>

When you're done with your test network:

### \*Fast clean up

{{< details summary="Details \<click to expand/collapse>" >}}<br/>

To quickly clean up your Solo network and remove all resources (all Kind clusters!), you can use the following commands, be aware you will lose all your logs and data from prior runs:

```bash
for cluster in $(kind get clusters);do kind delete cluster -n $cluster;done
rm -Rf ~/.solo
```

{{< /details >}}<br/>

### 1. Destroy relay node

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

```
solo relay node destroy -i node1 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}"
```

Example output:

```
$SOLO_RELAY_DESTROY_OUTPUT
```

{{< /details >}}<br/>

### 2. Destroy mirror node

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

```
solo mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

Example output:

```
$SOLO_MIRROR_NODE_DESTROY_OUTPUT
```

{{< /details >}}<br/>

### 3. Destroy explorer node

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

```
solo explorer node destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

Example output:

```
$SOLO_EXPLORER_DESTROY_OUTPUT
```

{{< /details >}}<br/>

### \*Destroy block node (Experimental)

{{< details summary="Details \<click to expand/collapse>" >}}<br/>

Block Node destroy should run prior to consensus network destroy, since consensus network destroy removes the remote config.  To destroy the block node (if you deployed it), you can use the following command:

```
solo block node destroy --deployment "${SOLO_DEPLOYMENT} --cluster-ref kind-${SOLO_CLUSTER_NAME}"
```

Example output:

```
$SOLO_BLOCK_NODE_DESTROY_OUTPUT
```

{{< /details >}}<br/>

### 4. Destroy network

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

```
solo consensus network destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

Example output:

```
$SOLO_NETWORK_DESTROY_OUTPUT
```

{{< /details >}}<br/>

{{< /details >}}<br/>

## Next Steps

{{< details summary="Details \<click to expand/collapse>" open=true >}}<br/>

Congratulations! You now have a working Hedera test network. Here are some suggestions for what to explore next:

1. **Deploy Smart Contracts**: Test your Solidity contracts on the local network
2. **Mirror Node Queries**: Explore the REST API at `http://localhost:5551`
3. **Multi-Node Testing**: Add more nodes to test scalability
4. **Network Upgrades**: Practice upgrading the Hedera platform version
5. **Integration Testing**: Connect your applications to the local network

Remember, this is your personal Hedera playground. Experiment freely, break things, learn, and have fun building on Hedera!

Happy coding with Solo! 🚀

{{< /details >}}<br/>
