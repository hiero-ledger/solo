# Network with Block Node Example

This example demonstrates how to deploy a Hiero Hashgraph Solo network with a block node using Kubernetes and Taskfile.

## What it does

* Creates a local Kubernetes cluster using Kind
* Deploys a Solo network with a single consensus node, mirror node, relay, explorer, and block node
* Provides tasks to install (start) and destroy the network

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

***

This example is self-contained and does not require any files from outside this directory.
