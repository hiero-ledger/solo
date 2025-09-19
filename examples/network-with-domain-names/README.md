# Network with Domain Names Example

This example demonstrates how to deploy a Hiero Hashgraph Solo network with custom domain names for nodes, mirror node, relay, and explorer using Kubernetes and Taskfile.

## What it does

* Creates a local Kubernetes cluster using Kind
* Deploys a Solo network with a single consensus node, mirror node, relay, explorer, and custom domain names for all services
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
   * Generate node keys
   * Deploy the network, node, mirror node, relay, and explorer with custom domain names
   * Set up port forwarding for key services
   * Run a sample SDK connection script

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

* `install`: Installs and starts the Solo network with custom domain names for all components, sets up port forwarding, and runs a sample SDK connection.
* `destroy`: Stops and removes all network components and deletes the Kind cluster.

## Customization

You can adjust the domain names and other settings by editing the `vars:` section in the `Taskfile.yaml`.
