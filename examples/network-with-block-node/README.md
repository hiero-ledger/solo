# Network with Block Node Example

This example demonstrates how to deploy a Hiero Hashgraph Solo network with a block node using Kubernetes and Taskfile.

## What it does

* Creates a local Kubernetes cluster using Kind
* Deploys a Solo network with a single consensus node, mirror node, relay, explorer, and block node
* Provides tasks to install (start) and destroy the network

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-network-with-block-node.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/network-with-block-node).

## Usage

1. **Install dependencies**
   * Make sure you have [Kind](https://kind.sigs.k8s.io/), [kubectl](https://kubernetes.io/docs/tasks/tools/), [Node.js](https://nodejs.org/), and [Task](https://taskfile.dev/) installed.

2. **Deploy the network**
   ```sh
   task
   ```
   This will:
   * Install the Solo CLI
   * Create a Kind cluster
   * Initialize Solo
   * Connect and set up the cluster reference
   * Create and configure the deployment
   * Add a block node
   * Generate node keys
   * Deploy the network, node, mirror node, relay, and explorer

3. **Destroy the network**
   ```sh
   task destroy
   ```
   This will:
   * Stop the node
   * Destroy the mirror node, relay, and explorer
   * Destroy the Solo network
   * Delete the Kind cluster

## Tasks

* `install`: Installs and starts the Solo network with a block node, mirror node, relay, and explorer.
* `destroy`: Stops and removes all network components and deletes the Kind cluster.

## Customization

You can adjust the number of nodes and other settings by editing the `vars:` section in the `Taskfile.yml`.

### Advanced: Block Node Routing Configuration

The `--priority-mapping` flag allows you to configure how each consensus node sends blocks to specific block nodes.

#### Usage

```bash
solo block node add --deployment my-network --priority-mapping node1
solo block node add --deployment my-network --priority-mapping node1,node2=10
```

This example means:
* Consensus node `node1` sends blocks to block nodes 1 and 2
  * Block node 1 priority is 2
  * Block node 2 priority is 1
* Consensus node `node2` sends blocks to block node 2
  * Block node 1 priority is 1
  * Block node 2 priority is 10

#### Multi-Cluster Setup with Custom Routing

`block-nodes.json` uses Fully Qualified Domain Names (FQDNs) to route each block node, so it works with multi-cluster setups out of the box.
