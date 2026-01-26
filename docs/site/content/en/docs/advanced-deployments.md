---
title: "Advanced Network Deployments"
weight: 25
description: >
  Advanced deployment options for Solo networks including Falcon configuration, manual step-by-step deployment, Helm chart customization, and dynamic node management.
type: docs
---

This guide covers advanced deployment scenarios for users who need more control over their Solo network configuration.

## Prerequisites

Before using advanced deployment options, ensure you have completed the [Solo User Guide](step-by-step-guide.md) and have:
- Solo installed (`solo --version`)
- Docker running with adequate resources
- kubectl configured
- A Kind cluster created

Set up your environment variables if not already done:

```bash
export SOLO_CLUSTER_NAME=solo
export SOLO_NAMESPACE=solo
export SOLO_CLUSTER_SETUP_NAMESPACE=solo-cluster
export SOLO_DEPLOYMENT=solo-deployment
```

## Falcon Deployment

Falcon deployment provides fine-grained control over all network components through a YAML configuration file. This is ideal for CI/CD pipelines, automated testing, and complex deployment scenarios.

### Basic Falcon Deployment

```bash
solo one-shot falcon deploy --values-file falcon-values.yaml
```

### Example Configuration File

Create a file named `falcon-values.yaml`:

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

### Multi-Node Falcon Configuration

For multiple consensus nodes:

```yaml
network:
  --deployment: "my-multi-network"
  --release-tag: "v0.65.0"
  --node-aliases: "node1,node2,node3"

setup:
  --release-tag: "v0.65.0"
  --node-aliases: "node1,node2,node3"

consensusNode:
  --deployment: "my-multi-network"
  --node-aliases: "node1,node2,node3"
  --force-port-forward: true

mirrorNode:
  --enable-ingress: true
  --pinger: true

explorerNode:
  --enable-ingress: true

relayNode:
  --node-aliases: "node1"
```

### Falcon with Block Node

> **Note**: Block Node is experimental and requires at least 16 GB of memory allocated to Docker.

```yaml
network:
  --deployment: "block-node-network"
  --release-tag: "v0.62.6"
  --node-aliases: "node1"

setup:
  --release-tag: "v0.62.6"
  --node-aliases: "node1"

consensusNode:
  --deployment: "block-node-network"
  --node-aliases: "node1"
  --force-port-forward: true

blockNode:
  --deployment: "block-node-network"
  --release-tag: "v0.62.6"

mirrorNode:
  --enable-ingress: true
  --pinger: true

explorerNode:
  --enable-ingress: true

relayNode:
  --node-aliases: "node1"
```

### Tearing Down Falcon Deployment

```bash
solo one-shot falcon destroy
```

See the [Falcon example](../examples/one-shot-falcon/) for a complete configuration template.

## Step-by-Step Manual Deployment

For maximum control, you can deploy each component individually. This is useful for debugging, custom configurations, or when you need to modify specific deployment steps.

### 1. Connect Cluster and Create Deployment

```bash
# Connect to the Kind cluster
solo cluster-ref config connect --cluster-ref kind-${SOLO_CLUSTER_NAME} --context kind-${SOLO_CLUSTER_NAME}

# Create a new deployment
solo deployment config create -n "${SOLO_NAMESPACE}" --deployment "${SOLO_DEPLOYMENT}"
```

### 2. Add Cluster to Deployment

Specify the number of consensus nodes:

```bash
# For a single node
solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 1

# For multiple nodes (e.g., 3 nodes)
# solo deployment cluster attach --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --num-consensus-nodes 3
```

### 3. Generate Keys

```bash
solo keys consensus generate --gossip-keys --tls-keys --deployment "${SOLO_DEPLOYMENT}"
```

PEM key files are generated in `~/.solo/cache/keys/`.

### 4. Set Up Cluster with Shared Components

```bash
solo cluster-ref config setup -s "${SOLO_CLUSTER_SETUP_NAMESPACE}"
```

### 5. Deploy the Network

```bash
solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}"
```

### 6. Set Up Consensus Nodes

```bash
export CONSENSUS_NODE_VERSION=v0.66.0
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --release-tag "${CONSENSUS_NODE_VERSION}"
```

### 7. Start Consensus Nodes

```bash
solo consensus node start --deployment "${SOLO_DEPLOYMENT}"
```

### 8. Deploy Mirror Node

```bash
solo mirror node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME} --enable-ingress --pinger
```

The `--pinger` flag ensures record files are imported regularly.

### 9. Deploy Explorer

```bash
solo explorer node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
```

### 10. Deploy JSON RPC Relay

```bash
solo relay node add -i node1 --deployment "${SOLO_DEPLOYMENT}"
```

## Deploying Block Node (Experimental)

> **Warning**: Block Node requires at least 16 GB of memory and Consensus Node version v0.62.3 or higher.

Block Node must be deployed **before** the network:

```bash
# Deploy Block Node first
solo block node add --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-"${SOLO_CLUSTER_NAME}" --release-tag v0.62.6

# Then deploy the network with the matching version
solo consensus network deploy --deployment "${SOLO_DEPLOYMENT}"
solo consensus node setup --deployment "${SOLO_DEPLOYMENT}" --release-tag v0.62.6
solo consensus node start --deployment "${SOLO_DEPLOYMENT}"
```

To destroy Block Node (must be done **before** network destruction):

```bash
solo block node destroy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}
```

## Connecting to a Remote Cluster

Solo can deploy to any Kubernetes cluster, not just local Kind clusters.

### Setting Up Remote Cluster Connection

```bash
# View available contexts
kubectl config get-contexts

# Switch to your remote cluster context
kubectl config use-context <context-name>

# Connect Solo to the remote cluster
solo cluster-ref config connect --cluster-ref <cluster-ref-name> --context <context-name>
```

### Remote Cluster Requirements

- Kubernetes 1.24 or higher
- Sufficient resources for network components
- Network access to pull container images
- Storage class available for persistent volumes

## Adding Nodes to an Existing Network

You can dynamically add new consensus nodes to a running network.

### Quick Add (When Available)

```bash
# TODO: solo consensus node add (coming soon)
```

### Step-by-Step Node Addition

For precise control over the node addition process:

```bash
# Prepare the new node
solo consensus dev-node-add prepare \
  --gossip-keys true \
  --tls-keys true \
  --deployment "${SOLO_DEPLOYMENT}" \
  --pvcs true \
  --admin-key <admin-key> \
  --node-alias node2 \
  --output-dir context

# Submit the transaction to add the node
solo consensus dev-node-add submit-transaction \
  --deployment "${SOLO_DEPLOYMENT}" \
  --input-dir context

# Execute the node addition
solo consensus dev-node-add execute \
  --deployment "${SOLO_DEPLOYMENT}" \
  --input-dir context
```

See the [node-create-transaction example](../examples/node-create-transaction/) for a complete walkthrough.

## Deleting Nodes from a Network

You can dynamically remove consensus nodes from a running network.

### Quick Delete (When Available)

```bash
# TODO: solo consensus node destroy (coming soon)
```

### Step-by-Step Node Deletion

For precise control over the node deletion process:

```bash
# Prepare the node for deletion
solo consensus dev-node-delete prepare \
  --deployment "${SOLO_DEPLOYMENT}" \
  --node-alias node2 \
  --output-dir context

# Submit the transaction to delete the node
solo consensus dev-node-delete submit-transaction \
  --deployment "${SOLO_DEPLOYMENT}" \
  --input-dir context

# Execute the node deletion
solo consensus dev-node-delete execute \
  --deployment "${SOLO_DEPLOYMENT}" \
  --input-dir context
```

See the [node-delete-transaction example](../examples/node-delete-transaction/) for a complete walkthrough.

## Step-by-Step Node Update

For testing the update process or granular control:

```bash
# Prepare the update
solo consensus dev-node-update prepare \
  --deployment "${SOLO_DEPLOYMENT}" \
  --node-alias node1 \
  --release-tag v0.66.0 \
  --output-dir context

# Submit the update transaction
solo consensus dev-node-update submit-transaction \
  --deployment "${SOLO_DEPLOYMENT}" \
  --input-dir context

# Execute the update
solo consensus dev-node-update execute \
  --deployment "${SOLO_DEPLOYMENT}" \
  --input-dir context
```

See the [node-update-transaction example](../examples/node-update-transaction/) for a complete walkthrough.

## Complete Cleanup for Manual Deployments

When using manual deployment, clean up in reverse order:

```bash
# 1. Destroy relay node
solo relay node destroy -i node1 --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}

# 2. Destroy mirror node
solo mirror node destroy --deployment "${SOLO_DEPLOYMENT}" --force

# 3. Destroy explorer node
solo explorer node destroy --deployment "${SOLO_DEPLOYMENT}" --force

# 4. Destroy block node (if deployed) - BEFORE network destruction
solo block node destroy --deployment "${SOLO_DEPLOYMENT}" --cluster-ref kind-${SOLO_CLUSTER_NAME}

# 5. Destroy the network
solo consensus network destroy --deployment "${SOLO_DEPLOYMENT}" --force
```

## Additional Examples

Explore more deployment scenarios in the [Examples section](../examples/):

- [Address Book Configuration](../examples/address-book/)
- [Custom Network Configuration](../examples/custom-network-config/)
- [Network with Domain Names](../examples/network-with-domain-names/)
- [Local Build with Custom Config](../examples/local-build-with-custom-config/)
- [State Save and Restore](../examples/state-save-and-restore/)
- [Multicluster Backup/Restore](../examples/multicluster-backup-restore/)
