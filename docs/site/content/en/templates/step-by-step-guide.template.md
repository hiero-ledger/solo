---
title: "Solo User Guide"
weight: 20
description: >
  Learn how to set up your first Hedera test network using Solo. This step-by-step guide covers installation, deployment, and your first transaction.
type: docs
---

> 📝 If you have **less than 16 GB of memory** available for Docker, **skip the Block Node add/destroy steps** in this guide.

> 📝 There should be a **table of contents** on the right side of your screen if your browser width is large enough.

## Introduction

Welcome to the world of Hedera development! If you're looking to build and test applications on the Hedera network but don't want to spend HBAR on testnet or mainnet transactions, you've come to the right place. Solo is your gateway to running your own local Hedera test network, giving you complete control over your development environment.

Solo is an opinionated command-line interface (CLI) tool designed to deploy and manage standalone Hedera test networks. Think of it as your personal Hedera sandbox where you can experiment, test features, and develop applications without any external dependencies or costs. Whether you're building smart contracts, testing consensus mechanisms, or developing dApps, Solo provides the infrastructure you need.

By the end of this tutorial, you'll have your own Hedera test network running locally, complete with consensus nodes, mirror nodes, and all the infrastructure needed to submit transactions and test your applications. Let's dive in!

## Prerequisites

Before we begin, let's ensure your system meets the requirements and has all the necessary software installed. Don't worry if this seems like a lot – we'll walk through each step together.

### System Requirements (for a bare minimum install running 1 node)

First, check that your computer meets these minimum specifications:

* **Memory**: At least **12 GB** (16 GB recommended for smoother performance)
* **CPU**: Minimum **6 cores** (8 cores recommended)
* **Storage**: At least **20 GB of free disk space**
* **Operating System**: macOS, Linux, or Windows with WSL2

{{< details summary="Platform notes \<click to expand/collapse>" open=true >}}<br/>

* **Windows (WSL2)** – Enable **Virtual Machine Platform** and **Windows Subsystem for Linux** from **Turn Windows features on or off**, reboot, then run `wsl --install Ubuntu` in PowerShell. For the rest of this guide, run all commands from the Ubuntu (WSL2) terminal so Docker and Kubernetes share the same Linux environment.
* **Linux** – Use a recent LTS distribution (for example Ubuntu 22.04+, Debian 12, or Fedora 40+) with cgroup v2 enabled.
* **macOS** – Apple silicon is fully supported. Intel-based Macs should use macOS 12 or later.

{{< /details >}}

### Required Software

You'll need to install a few tools before we can set up Solo. Here's what you need and how to get it:

### 1. Node.js (≥ 22.0.0)

{{< details summary="Details (click to expand/collapse)" open=true >}}

Solo is built on Node.js, so you'll need version **22.0.0 or higher**. We recommend using Node Version Manager (nvm) for easy version management.

**macOS / Linux (nvm):**

```bash
# Install nvm (macOS/Linux)
curl -o https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart your shell, then:
nvm install 22.0.0
nvm use 22.0.0

# Verify installation
node --version
```

**Windows (WSL2 + nvm in Ubuntu):**

In your Ubuntu (WSL2) terminal:

```bash
# Install nvm in WSL2 (Ubuntu)
curl -o https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart your shell, then:
nvm install 22.0.0
nvm use 22.0.0

# Verify installation
node --version
```

If you prefer to install Node.js directly in **Windows (outside WSL2)**, you can use **nvm-windows**. See: https://github.com/coreybutler/nvm-windows\
In that case, run Solo commands from the same environment where Node.js is installed.

{{< /details >}}

### 2. Docker Desktop

{{< details summary="Details (click to expand/collapse)" open=true >}}

Docker is essential for running the containerized Hedera network components:

* **macOS/Windows**: Download Docker Desktop from https://www.docker.com/products/docker-desktop
* **Linux**: Follow the installation guide for your distribution at https://docs.docker.com/engine/install/

After installation, ensure Docker is running and reachable:

```bash
docker --version
docker ps
```

{{< /details >}}

### 3. kubectl (Linux & WSL2)

{{< details summary="Details (click to expand/collapse)" open=true >}}

On **macOS**, Docker Desktop already ships a `kubectl` client, so you usually don’t need to install it separately.\
On **Linux** and inside **WSL2**, you must install `kubectl` yourself.

For Ubuntu/Debian-based shells (including Ubuntu on WSL2):

```bash
sudo apt update && sudo apt install -y ca-certificates curl
ARCH="$(dpkg --print-architecture)"
curl -fsSLo kubectl "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/kubectl

kubectl version --client
```

{{< /details >}}

## Preparing Your Environment

Now that we have all prerequisites in place, let's install Solo and set up our environment.

One thing to consider: old installs can really hamper your ability to get a new install up and running. If you have an old install of Solo, or if you are having issues with the install, please run the following commands to clean up your environment before proceeding.

### 1. Installing Solo

{{< details summary="Details (click to expand/collapse)" open=true >}}

Open your terminal and install Solo using `npx`:

```bash
npx @hashgraph/solo

# Verify the installation
solo --version

# Or use different output formats (Kubernetes-style)
solo --version -o json    # JSON format: {"version": "0.46.1"}
solo --version -o yaml    # YAML format: version: 0.46.1
solo --version -o wide    # Plain text: 0.46.1
```

You should see output showing the latest version which should match our NPM package version: https://www.npmjs.com/package/@hashgraph/solo

The `--output` (or `-o`) flag can be used with various Solo commands to produce machine-readable output in formats like `json`, `yaml`, or `wide`.

{{< /details >}}

### \*Cleaning up an old install

{{< details summary="Details (click to expand/collapse)" open=true >}}

> ⚠️ **Warning:** The commands below will:
>
> > * **Delete all Kind clusters** on your machine (`kind delete cluster` for every cluster returned by `kind get clusters`), and
> > * **Remove your Solo home directory** (`~/.solo`), including cached charts, logs, keys, and configuration.
> >
> > Only run this if you are sure you no longer need any existing Solo or Kind environments.

The team is presently working on a number of fixes and automation that will relegate the need for this, but currently Solo can be finicky with artifacts from prior installs. A quick command to prep your station for a new install is a good idea:

```bash
for cluster in $(kind get clusters); do
  kind delete cluster -n "$cluster"
done
rm -rf ~/.solo
```

{{< /details >}}

### 2. Setting up your environment variables

{{< details summary="Details (click to expand/collapse)" open=true >}}

You need to declare some environment variables. Unless you intentionally include these in your shell config (for example, `.zshrc` or `.bashrc`), you will lose them when you close your terminal.

Throughout the remainder of this walkthrough, we’ll assume these values:

```bash
export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_DEPLOYMENT=solo-deployment
```

{{< /details >}}

### 3. Create a cluster

{{< details summary="Details (click to expand/collapse)" open=true >}}

```bash
kind create cluster -n "${SOLO_CLUSTER_NAME}"
```

Example output:

```text
Creating cluster "solo-e2e" ...
  Ensuring node image (kindest/node:v1.32.2) 🖼  ...
 ✓ Ensuring node image (kindest/node:v1.32.2) 🖼
  Preparing nodes 📦   ...
 ✓ Preparing nodes 📦
  Writing configuration 📜  ...
 ✓ Writing configuration 📜
  Starting control-plane 🕹️  ...
 ✓ Starting control-plane 🕹️
  Installing CNI 🔌  ...
 ✓ Installing CNI 🔌
  Installing StorageClass 💾  ...
 ✓ Installing StorageClass 💾
Set kubectl context to "kind-solo-e2e"
You can now use your cluster with:

kubectl cluster-info --context kind-solo-e2e

Have a nice day! 👋
```

{{< /details >}}

### \*Connecting to a remote cluster

{{< details summary="Details (click to expand/collapse)" >}}

You may use a remote Kubernetes cluster. In this case, ensure the Kubernetes context is set up correctly.

```bash
kubectl config get-contexts
kubectl config use-context <context-name>
```

{{< /details >}}

## One Shot Deployment

Solo provides three one-shot deployment options to quickly set up your Hedera test network:

### Single Node Deployment (Recommended for Development)

For a simple setup with a single node plus mirror node, explorer, and JSON RPC relay, you can follow these quick steps. This is ideal for testing and development purposes.

```bash
solo one-shot single deploy
```

When you're finished, you can tear down your Solo network just as easily:

```bash
solo one-shot single destroy
```

### Multiple Node Deployment (For Consensus Testing)

For testing consensus scenarios or multi-node behavior, you can deploy a network with multiple consensus nodes. This setup includes all the same components as the single node deployment but with multiple consensus nodes for testing consensus mechanisms.

```bash
solo one-shot multi deploy 
```

This command will:

* Deploy multiple consensus nodes
* Set up mirror node, explorer, and JSON RPC relay
* Generate appropriate keys for all nodes
* Create predefined accounts for testing

When you're finished with the multiple node network:

```bash
solo one-shot multi destroy
```

> 📝 **Note**: Multiple node deployments require more system resources. Ensure you have adequate memory and CPU allocated to Docker (recommended: 16 GB+ of memory, 8+ CPU cores).

### Falcon Deployment (Advanced Configuration)

For advanced users who need fine-grained control over all network components, the Falcon deployment uses a YAML configuration file to customize every aspect of the network.

```bash
solo one-shot falcon deploy --values-file falcon-values.yaml
```

The Falcon deployment allows you to:

* Configure all network components through a single YAML file
* Customize consensus nodes, mirror node, explorer, relay, and block node settings
* Set specific versions, resource allocations, and feature flags
* Integrate cleanly into CI/CD pipelines and automated testing scenarios

**Example configuration file** (`falcon-values.yaml`):

```yaml
network:
  --deployment: "my-network"
  --release-tag: "v0.65.0"
  --node-aliases: "node1"

setup:
  --release-tag: "v0.65.0"
  --node-aliases: "node1"

consensusNode:
  --deployment: "my-network"
  --node-aliases: "node1"
  --force-port-forward: true

mirrorNode:
  --enable-ingress: true
  --pinger: true

explorerNode:
  --enable-ingress: true

relayNode:
  --node-aliases: "node1"
```

See the Falcon example in the repository for a complete configuration template.

When you're finished with the Falcon deployment:

```bash
solo one-shot falcon destroy
```

> 📝 **Note**: The Falcon deployment reads deployment name and other shared settings from the values file, so you don't need to specify `--deployment` on the command line.

## Step-by-Step Solo Network Deployment

If you have a more complex setup in mind, such as multiple nodes or specific configurations, follow these detailed steps to deploy your Solo network.

### 1. Initialize Solo

{{< details summary="Details (click to expand/collapse)" open=true >}}

Reset the `.solo` directory before initializing Solo. This step is crucial to ensure a clean setup without any leftover artifacts from previous installations. See: [\*Cleaning up an old install](#cleaning-up-an-old-install)

```bash
solo init
```

Example output:

```text
>> environment variable 'SOLO_HOME' exists, using its value

******************************* Solo *********************************************
Version                 : 0.50.0
Kubernetes Context      : kind-solo
Kubernetes Cluster      : kind-solo
Current Command         : init
**********************************************************************************

***************************************************************************************
Note: solo stores various artifacts (config, logs, keys etc.) in its home directory: /Users/torfinn/.solo
If a full reset is needed, delete the directory or relevant sub-directories before running 'solo init'.
***************************************************************************************
**********************************************************************************
'solo init' is now deprecated, you don't need to run it anymore.
**********************************************************************************

 Setup home directory and cache
✔ Setup home directory and cache
 Create local configuration
 Create local configuration [SKIPPED: Create local configuration]
 Copy templates in '/Users/torfinn/.solo/cache'
✔ Copy templates in '/Users/torfinn/.solo/cache'
 Check dependencies
 Check dependency: helm [OS: darwin, Release: 24.4.0, Arch: arm64]
 Check dependency: kubectl [OS: darwin, Release: 24.4.0, Arch: arm64]
✔ Check dependency: helm [OS: darwin, Release: 24.4.0, Arch: arm64] [0.2s]
✔ Check dependency: kubectl [OS: darwin, Release: 24.4.0, Arch: arm64] [0.3s]
✔ Check dependencies [0.3s]
 Setup chart manager
✔ Setup chart manager [5s]
```

{{< /details >}}

### 2. Connect the cluster and create a deployment

{{< details summary="Details (click to expand/collapse)" open=true >}}

This command will create a deployment in the specified clusters, and generate the `LocalConfig` and `RemoteConfig` used by Kubernetes.

The deployment will:

* Create a namespace (usually matching the deployment name)
* Set up ConfigMaps and secrets
* Deploy network infrastructure
* Create persistent volumes if needed

> 📝 Notice that the `--cluster-ref` value is `kind-solo`. When you created the Kind cluster it created a cluster reference in the Kubernetes config with the name `kind-solo`. If you used a different name, replace `kind-solo` with your cluster name, but prefix it with `kind-`.\
> 📝 Solo stores various artifacts (config, logs, keys etc.) in its home directory: `~/.solo`. If you need a full reset, delete this directory before running `solo init` again.

```bash
# Connect to the cluster you created in a previous command
solo cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}

# Create the deployment
solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```
$SOLO_CLUSTER_REF_CONNECT_OUTPUT
```

```
$SOLO_DEPLOYMENT_CREATE_OUTPUT
```

{{< /details >}}

### 3. Add a cluster to the deployment you created

{{< details summary="Details (click to expand/collapse)" open=true >}}

This command is the first time you specify how many consensus nodes you want to add to your deployment. For the sake of resource usage in this guide, we’ll use **1 consensus node**.

```bash
# Add a cluster to the deployment you created
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1

# Tip: if the CLI is unresponsive, there’s a guided mode:
# solo deployment cluster attach
```

Example output:

```
$SOLO_DEPLOYMENT_ADD_CLUSTER_OUTPUT
```

{{< /details >}}

### 4. Generate keys

{{< details summary="Details (click to expand/collapse)" open=true >}}

You need to generate keys for your nodes — in this example, a single node.

```bash
solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```
$SOLO_NODE_KEY_PEM_OUTPUT
```

PEM key files are generated in the `~/.solo/cache/keys` directory:

```text
hedera-node1.crt    hedera-node3.crt    s-private-node1.pem s-public-node1.pem  unused-gossip-pem
hedera-node1.key    hedera-node3.key    s-private-node2.pem s-public-node2.pem  unused-tls
hedera-node2.crt    hedera-node4.crt    s-private-node3.pem s-public-node3.pem
hedera-node2.key    hedera-node4.key    s-private-node4.pem s-public-node4.pem
```

{{< /details >}}

### 5. Set up cluster with shared components

{{< details summary="Details (click to expand/collapse)" open=true >}}

```bash
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
```

Example output:

```
$SOLO_CLUSTER_SETUP_OUTPUT
```

{{< /details >}}

## Deploying Helm chart with network components

Now comes the exciting part – deploying your Hedera test network!

### \*Deploy a Block Node (experimental)

{{< details summary="Details (click to expand/collapse)" >}}

> ⚠️ Block Node is **experimental** in Solo. It requires a minimum of **16 GB of memory** allocated to Docker. If you have less than 16 GB of memory, **skip this step**.

Block Node uses a lot of memory. In addition, it requires a version of Consensus Node to be at least **v0.62.3**. You will need to augment the `solo consensus network deploy` and `solo consensus node setup` commands with the `--release-tag v0.62.6` option to ensure that the Consensus Node is at the correct version.\
Note: `v0.62.6` is the latest patch for `v0.62`.

```bash
solo block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" --release-tag v0.62.6
```

Example output:

```text
$SOLO_BLOCK_NODE_ADD_OUTPUT
```

{{< /details >}}

### 1. Deploy the network

{{< details summary="Details (click to expand/collapse)" open=true >}}

Deploying the network can sometimes time out as images are downloaded and pods start. If you experience a failure, double-check the resources you've allocated in Docker and try again.

```bash
solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```text
$SOLO_NETWORK_DEPLOY_OUTPUT
```

{{< /details >}}

### 2. Set up a node with Hedera platform software

{{< details summary="Details (click to expand/collapse)" open=true >}}

This step downloads the Hedera platform code and sets up your node(s).

```bash
# Consensus node setup
export CONSENSUS_NODE_VERSION=v0.66.0  # or whatever version you are trying to deploy, starting with a `v`
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}"
```

Example output:

```text
$SOLO_NODE_SETUP_OUTPUT
```

{{< /details >}}

### 3. Start the nodes

{{< details summary="Details (click to expand/collapse)" open=true >}}

Now that everything is set up, start your consensus node(s):

```bash
solo consensus node start --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```text
$SOLO_NODE_START_OUTPUT
```

{{< /details >}}

### 4. Deploy a mirror node

{{< details summary="Details (click to expand/collapse)" open=true >}}

This is the most memory-intensive step from a resource perspective. If you have issues here, check your local resource utilization and make sure there's memory available for Docker (close all non-essential applications). You can also reduce Docker's swap usage in settings to ease memory pressure.

The `--pinger` flag starts a pinging service that sends transactions to the network at regular intervals. This is needed because the record file is not imported into the mirror node until the next one is created.

```bash
# Deploy with explicit configuration
solo mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress --pinger
```

Example output:

```text
$SOLO_MIRROR_NODE_DEPLOY_OUTPUT
```

{{< /details >}}

### 5. Deploy the explorer

{{< details summary="Details (click to expand/collapse)" open=true >}}

The explorer gives you a UI to inspect accounts, transactions, and network status.

```bash
# Deploy explorer
solo explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
```

Example output:

```text
$SOLO_EXPLORER_DEPLOY_OUTPUT
```

{{< /details >}}

### 6. Deploy a JSON RPC relay

{{< details summary="Details (click to expand/collapse)" open=true >}}

The JSON RPC relay allows you to interact with your Hedera network using standard JSON RPC calls. This is useful for integrating with existing tools and libraries.

```bash
# Deploy a Solo JSON RPC relay
solo relay node add -i node1 --deployment "${SOLO_DEPLOYMENT}"
```

Example output:

```text
$SOLO_RELAY_DEPLOY_OUTPUT
```

{{< /details >}}

### \*Check pod status

{{< details summary="Details (click to expand/collapse)" open=true >}}

To check the status of your Solo Kubernetes pods:

```bash
kubectl get pods -n "${SOLO_NAMESPACE}"
```

{{< /details >}}

## Working with Your Network

### Network Endpoints

{{< details summary="Details (click to expand/collapse)" open=true >}}

Some port forwarding is automatic, but in other cases you may want to configure your own using `kubectl port-forward`.

```bash
# Consensus Service for node1 (node ID = 0): localhost:50211
# (Usually automatic)
# kubectl port-forward svc/haproxy-node1-svc -n "${SOLO_NAMESPACE}" 50211:50211 > /dev/null 2>&1 &

# Explorer UI: http://localhost:8080
# (Usually automatic)
# kubectl port-forward svc/hiero-explorer -n "${SOLO_NAMESPACE}" 8080:8080 > /dev/null 2>&1 &

# Mirror Node gRPC, REST, REST Java, Web3 are usually exposed on `localhost:8081`
# when you passed `--enable-ingress` to the `solo mirror node add` command.

# Mirror Node gRPC: localhost:5600
kubectl port-forward svc/mirror-1-grpc -n "${SOLO_NAMESPACE}" 5600:5600 > /dev/null 2>&1 &

# Mirror Node REST API: http://localhost:5551
kubectl port-forward svc/mirror-1-rest -n "${SOLO_NAMESPACE}" 5551:80 > /dev/null 2>&1 &

# Mirror Node REST Java API: http://localhost:8084
kubectl port-forward svc/mirror-1-restjava -n "${SOLO_NAMESPACE}" 8084:80 > /dev/null 2>&1 &

# JSON RPC Relay: localhost:7546
# (Usually automatic)
# kubectl port-forward svc/relay-node1-hedera-json-rpc-relay -n "${SOLO_NAMESPACE}" 7546:7546 > /dev/null 2>&1 &
```

{{< /details >}}

## Managing Your Network

### Stopping and starting nodes

{{< details summary="Details (click to expand/collapse)" open=true >}}

You can control individual nodes or the entire network:

```bash
# Stop all nodes
solo consensus node stop --deployment "${SOLO_DEPLOYMENT}"

# Stop a specific node
solo consensus node stop --deployment "${SOLO_DEPLOYMENT}" --node-aliases node1

# Restart nodes
solo consensus node restart --deployment "${SOLO_DEPLOYMENT}"

# Start nodes again
solo consensus node start --deployment "${SOLO_DEPLOYMENT}"
```

{{< /details >}}

### Viewing logs

{{< details summary="Details (click to expand/collapse)" open=true >}}

Access Solo and Consensus Node logs for troubleshooting:

```bash
# Capture logs, configs, and diagnostic artifacts from all consensus nodes and test connections
solo consensus diagnostics all --deployment "${SOLO_DEPLOYMENT}"
```

You can also use `kubectl logs` directly if you prefer.

{{< /details >}}

### Updating the network

{{< details summary="Details (click to expand/collapse)" open=true >}}

To update nodes to a new Hedera version, you typically upgrade one minor version at a time:

```bash
solo consensus network upgrade --deployment "${SOLO_DEPLOYMENT}" --upgrade-version v0.62.6
```

{{< /details >}}

### Updating a single node

{{< details summary="Details (click to expand/collapse)" open=true >}}

To update a single node to a new Hedera version (again, usually one minor version at a time):

```bash
solo consensus node update --deployment "${SOLO_DEPLOYMENT}" --node-alias node1 --release-tag v0.62.6
```

It is also possible to update a single node through a process with separated steps. This is only useful in very specific cases, such as when testing the update process itself:

```bash
solo consensus dev-node-update prepare --deployment "${SOLO_DEPLOYMENT}" --node-alias node1 --release-tag v0.62.6 --output-dir context
solo consensus dev-node-update submit-transaction --deployment "${SOLO_DEPLOYMENT}" --input-dir context
solo consensus dev-node-update execute --deployment "${SOLO_DEPLOYMENT}" --input-dir context
```

{{< /details >}}

### Adding a new node to the network

{{< details summary="Details (click to expand/collapse)" open=true >}}

Adding a new node to an existing Solo network (high-level overview):

```bash
TODO solo consensus node add
```

It is possible to add a new node through a process with separated steps. This is only useful in very specific cases, such as when testing the node-adding process:

```bash
solo consensus dev-node-add prepare --gossip-keys true --tls-keys true --deployment "${SOLO_DEPLOYMENT}" --pvcs true --admin-key ***** --node-alias node1 --output-dir context
solo consensus dev-node-add submit-transaction --deployment "${SOLO_DEPLOYMENT}" --input-dir context
solo consensus dev-node-add execute --deployment "${SOLO_DEPLOYMENT}" --input-dir context
```

{{< /details >}}

### Deleting a node from the network

{{< details summary="Details (click to expand/collapse)" open=true >}}

This command is used to delete a node from an existing Solo network:

```bash
TODO solo consensus node destroy
```

It is possible to delete a node through a process with separated steps. This is only useful in very specific cases, such as when testing the delete process:

```bash
solo consensus dev-node-delete prepare --deployment "${SOLO_DEPLOYMENT}" --node-alias node1 --output-dir context
solo consensus dev-node-delete submit-transaction --deployment "${SOLO_DEPLOYMENT}" --input-dir context
solo consensus dev-node-delete execute --deployment "${SOLO_DEPLOYMENT}" --input-dir context
```

{{< /details >}}

## Troubleshooting: Common Issues and Solutions

### 1. Pods not starting

{{< details summary="Details (click to expand/collapse)" open=true >}}

If pods remain in `Pending` or `CrashLoopBackOff` state:

```bash
# Check pod events
kubectl describe pod -n "${SOLO_NAMESPACE}" <pod-name>
```

Common fixes:

* Increase Docker resources (memory/CPU)
* Check disk space
* Restart Docker and the Kind cluster

{{< /details >}}

### 2. Connection refused errors

{{< details summary="Details (click to expand/collapse)" open=true >}}

If you can't connect to network endpoints:

```bash
# Check service endpoints
kubectl get svc -n "${SOLO_NAMESPACE}"

# Manually forward ports if needed (example)
kubectl port-forward -n "${SOLO_NAMESPACE}" svc/network-node-0 50211:50211
```

{{< /details >}}

### 3. Node synchronization issues

{{< details summary="Details (click to expand/collapse)" open=true >}}

If nodes aren't forming consensus:

```bash
# Check node status
solo consensus state download --deployment "${SOLO_DEPLOYMENT}" --node-aliases node1

# Look for gossip connectivity issues
kubectl logs -n "${SOLO_NAMESPACE}" network-node-0 | grep -i gossip

# Restart problematic nodes
solo consensus node refresh --node-aliases node1 --deployment "${SOLO_DEPLOYMENT}"
```

{{< /details >}}

## Getting Help

{{< details summary="Details (click to expand/collapse)" open=true >}}

When you need assistance:

1. **Check the logs**\
   Use:
   ```bash
   solo consensus diagnostics all --deployment "${SOLO_DEPLOYMENT}"
   ```
   Then examine `~/.solo/logs/`.

2. **Documentation**\
   Visit the Solo docs site (linked from the repository README).

3. **GitHub Issues**\
   Report bugs at: https://github.com/hiero-ledger/solo/issues

4. **Community Support**\
   Join the Hedera Discord community (linked from the Hedera docs / website).

{{< /details >}}

## Cleanup

{{< details summary="Details (click to expand/collapse)" >}}

When you're done with your test network, you can clean up resources.

### \*Fast clean up

{{< details summary="Details (click to expand/collapse)" >}}

To quickly clean up your Solo network and remove all resources (all Kind clusters!), you can use the following commands. Be aware you will lose all your logs and data from prior runs:

```bash
for cluster in $(kind get clusters); do
  kind delete cluster -n "$cluster"
done
rm -rf ~/.solo
```

{{< /details >}}

### 1. Destroy relay node

{{< details summary="Details (click to expand/collapse)" open=true >}}

```bash
solo relay node destroy -i node1 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
```

Example output:

```text
$SOLO_RELAY_DESTROY_OUTPUT
```

{{< /details >}}

### 2. Destroy mirror node

{{< details summary="Details (click to expand/collapse)" open=true >}}

```bash
solo mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

Example output:

```text
$SOLO_MIRROR_NODE_DESTROY_OUTPUT
```

{{< /details >}}

### 3. Destroy explorer node

{{< details summary="Details (click to expand/collapse)" open=true >}}

```bash
solo explorer node destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

Example output:

```text
$SOLO_EXPLORER_DESTROY_OUTPUT
```

{{< /details >}}

### \*Destroy block node (experimental)

{{< details summary="Details (click to expand/collapse)" >}}

Block Node destroy should run **before** consensus network destroy, since consensus network destroy removes the remote config. To destroy the block node (if you deployed it):

```bash
solo block node destroy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
```

Example output:

```text
$SOLO_BLOCK_NODE_DESTROY_OUTPUT
```

{{< /details >}}

### 4. Destroy network

{{< details summary="Details (click to expand/collapse)" open=true >}}

```bash
solo consensus network destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

Example output:

```text
$SOLO_NETWORK_DESTROY_OUTPUT
```

{{< /details >}}

{{< /details >}}

## Next Steps

{{< details summary="Details (click to expand/collapse)" open=true >}}

Congratulations! You now have a working Hedera test network. Here are some suggestions for what to explore next:

1. **Deploy Smart Contracts** – Test your Solidity contracts on the local network.
2. **Mirror Node Queries** – Explore the REST API at `http://localhost:5551` (or your configured port).
3. **Multi-Node Testing** – Add more nodes to test scalability and consensus behavior.
4. **Network Upgrades** – Practice upgrading the Hedera platform version using Solo’s upgrade commands.
5. **Integration Testing** – Connect your applications to the local network and build end-to-end tests.

Remember, this is your personal Hedera playground. Experiment freely, break things, learn, and have fun building on Hedera!

Happy coding with Solo! 🚀

{{< /details >}}
