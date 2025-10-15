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

### Advanced: Block Node Routing Configuration

The `--block-node-cfg` flag allows you to configure how each consensus node sends blocks to specific block nodes. 

#### Usage

The flag accepts either:

1. **JSON string directly**:
   ```bash
   solo consensus network deploy --block-node-cfg '{"node1":[1,3],"node2":[2]}'
   ```

2. **Path to a JSON file**:
   ```bash
   # Create block-config.json
   echo '{"node1":[1,3],"node2":[2]}' > block-config.json
   
   # Use the file
   solo consensus network deploy --block-node-cfg block-config.json
   ```

#### Configuration Format

The JSON configuration maps consensus node names to arrays of block node IDs:

```json
{
  "node1": [1, 3],
  "node2": [2]
}
```

This example means:
- Consensus node `node1` sends blocks to block nodes 1 and 3
- Consensus node `node2` sends blocks to block node 2


#### Example: Multi-Node Setup with Custom Routing

```bash
# Deploy network with 3 consensus nodes and 3 block nodes
solo consensus network deploy \
  --deployment my-network \
  --number-of-consensus-nodes 3 \
  --block-node-cfg '{"node1":[1],"node2":[2],"node3":[3]}'

# This creates isolated routing: each consensus node talks to one block node
```

***

This example is self-contained and does not require any files from outside this directory.
