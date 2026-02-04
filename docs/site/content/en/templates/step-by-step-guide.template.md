---
title: "Solo User Guide"
weight: 20
description: >
  Learn how to set up your first Hiero test network using Solo. This step-by-step guide covers installation, deployment, and basic network operations.
type: docs
---

## Introduction

Welcome to the world of Hiero development! If you're looking to build and test applications on the Hiero network but don't want to spend HBAR on testnet or mainnet transactions, you've come to the right place. Solo is your gateway to running your own local Hiero test network, giving you complete control over your development environment.

Solo is an opinionated command-line interface (CLI) tool designed to deploy and manage standalone Hiero test networks. Think of it as your personal Hiero sandbox where you can experiment, test features, and develop applications without any external dependencies or costs.

By the end of this tutorial, you'll have your own Hiero test network running locally, complete with consensus nodes, mirror nodes, and all the infrastructure needed to submit transactions and test your applications.

## System Requirements

First, check that your computer meets these minimum specifications (for a single-node network):

* **Memory**: At least **12 GB** (16 GB recommended for smoother performance)
* **CPU**: Minimum **6 cores** (8 cores recommended)
* **Storage**: At least **20 GB of free disk space**
* **Operating System**: macOS, Linux, or Windows with WSL2

## Installation

Choose your platform below:

{{< tabpane >}}

{{< tab header="macOS" lang="bash" >}}
# 1. Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop
# Start Docker Desktop and allocate at least 12 GB of memory:
# Docker Desktop > Settings > Resources > Memory

# 3. Install Solo (this installs all other dependencies automatically)
brew install hiero-ledger/tools/solo

# Verify the installation
solo --version
{{< /tab >}}

{{< tab header="Linux" lang="bash" >}}
# 1. Install Homebrew for Linux
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Add Homebrew to your PATH
echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# 2. Install Docker Engine
# For Ubuntu/Debian:
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ${USER}
# Log out and back in for group changes to take effect

# 3. Install kubectl
sudo apt update && sudo apt install -y ca-certificates curl
ARCH="$(dpkg --print-architecture)"
curl -fsSLo kubectl "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/kubectl

# 4. Install Solo (this installs remaining dependencies automatically)
brew install hiero-ledger/tools/solo

# Verify the installation
solo --version
{{< /tab >}}

{{< tab header="Windows (WSL2)" lang="bash" >}}
# First, in Windows PowerShell (as Administrator):
# wsl --install Ubuntu
# Then reboot and open the Ubuntu terminal.
# All commands below run in your Ubuntu (WSL2) terminal.

# 1. Install Homebrew for Linux
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Add Homebrew to your PATH
echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.bashrc
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# 2. Install Docker Desktop for Windows
# Download from: https://www.docker.com/products/docker-desktop
# Enable WSL2 integration: Docker Desktop > Settings > Resources > WSL Integration
# Allocate at least 12 GB of memory: Docker Desktop > Settings > Resources

# 3. Install kubectl
sudo apt update && sudo apt install -y ca-certificates curl
ARCH="$(dpkg --print-architecture)"
curl -fsSLo kubectl "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/kubectl

# 4. Install Solo (this installs remaining dependencies automatically)
brew install hiero-ledger/tools/solo

# Verify the installation
solo --version

# IMPORTANT: Always run Solo commands from this WSL2 terminal.
{{< /tab >}}

{{< /tabpane >}}

{{< details summary="Alternative: Install via NPM (for contributors/advanced users)" >}}

If you need more control over dependencies or are contributing to Solo development:

```bash
# Requires Node.js >= 22.0.0 and Kind to be installed separately
npm install -g @hashgraph/solo
```

See the [Development Guide](../development/) for complete contributor setup instructions.

{{< /details >}}

### Troubleshooting Installation

{{< details summary="⚠️ Having trouble? Try cleaning up first" >}}

If you're experiencing issues installing or upgrading Solo (e.g., conflicts with a previous installation), you may need to clean up your environment first.

> **⚠️ Warning:** The commands below will delete Solo-managed Kind clusters and remove your Solo home directory (`~/.solo`).

```bash
# Delete only Solo-managed Kind clusters (names starting with "solo")
kind get clusters | grep '^solo' | while read cluster; do
  kind delete cluster -n "$cluster"
done

# Remove Solo configuration and cache
rm -rf ~/.solo
```

After cleaning up, retry the installation with `brew install hiero-ledger/tools/solo`.

{{< /details >}}

## Deploying Your Network

With Solo installed, deploying a complete Hiero test network takes just **one command**:

```bash
solo one-shot single deploy
```

That's it! This single command automatically:
* Creates a local Kubernetes cluster
* Sets up all required configurations
* Deploys a consensus node
* Deploys a mirror node with explorer UI
* Deploys a JSON RPC relay
* Configures port-forwarding so you can access services immediately
* Generates cryptographic keys
* Creates test accounts

The deployment takes a few minutes. When complete, your network is ready to use.

### What Gets Deployed

| Component | Description |
|-----------|-------------|
| Consensus Node | Hiero consensus node for processing transactions |
| Mirror Node | Stores and serves historical data |
| Explorer UI | Web interface for viewing accounts and transactions |
| JSON RPC Relay | Ethereum-compatible JSON RPC interface |

### Multiple Node Deployment

{{< details summary="For testing consensus scenarios (click to expand)" >}}

For testing consensus scenarios or multi-node behavior, you can deploy multiple consensus nodes by specifying the `--num-consensus-nodes` flag:

```bash
solo one-shot single deploy --num-consensus-nodes 3
```

This deploys 3 consensus nodes along with the same components as the single-node setup (mirror node, explorer, relay).

> **📝 Note**: Multiple node deployments require more resources. Ensure you have at least 16 GB of memory and 8 CPU cores allocated to Docker.

When finished:

```bash
solo one-shot single destroy
```

{{< /details >}}

## Working with Your Network

### Network Endpoints

After deployment, your network services are automatically available at:

| Service | Endpoint | Description |
|---------|----------|-------------|
| Explorer UI | `http://localhost:8080` | Web UI for inspecting network |
| Consensus Node | `localhost:50211` | gRPC endpoint for transactions |
| Mirror Node REST | `http://localhost:5551` | REST API for queries |
| JSON RPC Relay | `localhost:7546` | Ethereum-compatible JSON RPC |

Open http://localhost:8080 in your browser to explore your network.

### Check Pod Status

To verify all components are running:

```bash
kubectl get pods -A | grep -v kube-system
```

> **💡 Tip**: The Solo testing team recommends [k9s](https://k9scli.io/) for managing Kubernetes clusters. It provides a terminal-based UI that makes it easy to view pods, logs, and cluster status. Install it with `brew install k9s` and run `k9s` to launch.

## Managing Your Network

### Stopping and Starting Nodes

First, find your deployment name (shown during deployment or in `~/.solo/cache/last-one-shot-deployment.txt`):

```bash
cat ~/.solo/cache/last-one-shot-deployment.txt
```

Then use it in management commands:

```bash
# Stop all nodes
solo consensus node stop --deployment <deployment-name>

# Start nodes again
solo consensus node start --deployment <deployment-name>

# Restart nodes
solo consensus node restart --deployment <deployment-name>
```

### Viewing Logs

Capture logs and diagnostic information:

```bash
solo deployment diagnostics all --deployment <deployment-name>
```

Logs are saved to `~/.solo/logs/`. You can also use `kubectl logs` directly:

```bash
kubectl logs -n <namespace> <pod-name>
```

### Updating the Network

To update nodes to a new Hiero version:

```bash
solo consensus network upgrade --deployment <deployment-name> --upgrade-version v0.66.0
```

## Cleanup

### Destroying Your Network

> **🚨 Important:** Always destroy your network properly before deploying a new one!
>
> Skipping this step is one of the most common causes of deployment failures. Solo stores state about your deployment, and deploying a new network without destroying the old one first leads to conflicts and errors.

To remove your Solo network:

```bash
solo one-shot single destroy
```

This command:
* Removes all deployed pods and services
* Cleans up the Kubernetes namespace
* Deletes the Kind cluster
* Updates Solo's internal state

**Always run `destroy` before deploying a new network.**

### A Note on Resource Usage

Solo deploys a fully functioning mirror node that stores the transaction history generated by your local test network. During active testing, the mirror node's resource consumption will grow as it processes more transactions. If you notice increasing resource usage, destroying and redeploying the network with the commands above gives you a clean slate.

### Full Reset

If `solo one-shot single destroy` fails or you need to recover from a corrupted state:

```bash
# Delete only Solo-managed Kind clusters (names starting with "solo")
kind get clusters | grep '^solo' | while read cluster; do
  kind delete cluster -n "$cluster"
done

# Remove Solo configuration
rm -rf ~/.solo
```

> **⚠️ Warning:** Routinely deleting clusters between test runs is inefficient and unnecessary. Use `solo one-shot single destroy` for normal teardown. The full reset above should only be used when the standard destroy command fails. Avoid using `kind get clusters` without the `grep` filter — that would delete **every** Kind cluster on your machine, including any unrelated to Solo.

For additional troubleshooting steps, see the **[Troubleshooting Guide](troubleshooting.md#old-installation-artifacts)**.

## Next Steps

Congratulations! You now have a working Hiero test network. Here's what to explore next:

1. **[Using Solo with Hiero JavaScript SDK](javascript-sdk.md)** - Create accounts, topics, and submit transactions using the SDK.

2. **[Mirror Node Queries](solo-with-mirror-node.md)** - Learn how to query the mirror node REST API at `http://localhost:5551`.

3. **[Advanced Network Deployments](advanced-deployments.md)** - Deploy networks with custom configurations using Falcon, manual step-by-step deployment, or add/delete nodes dynamically.

4. **[Examples](../examples/)** - Explore example configurations for various deployment scenarios.

5. **[FAQ](faq.md)** - Common questions and answers about Solo.

If you run into issues, check the **[Troubleshooting Guide](troubleshooting.md)** for solutions to common problems.