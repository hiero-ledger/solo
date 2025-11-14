# Backup and Restore Workflow Example

This example demonstrates a complete backup and restore workflow for a Hiero network using Solo's `config ops backup` and `config ops restore` commands. It shows how to:

1. Deploy a complete network infrastructure (consensus + block + mirror + relay + explorer)
2. Generate transactions to create network state
3. Freeze the network and create a comprehensive backup
4. Destroy the entire cluster
5. Redeploy a fresh network
6. Restore from backup (ConfigMaps, Secrets, Logs, and State)
7. Verify the restored network is fully operational

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-backup-restore-workflow.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/backup-restore-workflow).

## Prerequisites

* [Task](https://taskfile.dev/) installed (`brew install go-task/tap/go-task` on macOS)
* [Kind](https://kind.sigs.k8s.io/) installed (`brew install kind` on macOS)
* [kubectl](https://kubernetes.io/docs/tasks/tools/) installed
* Node.js 22+ and npm installed
* Docker Desktop running with sufficient resources (8GB+ RAM recommended)

## Quick Start

### Run Complete Workflow

Execute the entire backup/restore workflow with a single command:

```bash
task
```

This will:

* ✅ Create a Kind cluster and deploy the complete network
* ✅ Generate test transactions
* ✅ Backup the entire network (ConfigMaps, Secrets, Logs, State)
* ✅ Destroy the cluster completely
* ✅ Redeploy a fresh network from scratch
* ✅ Restore all components from backup
* ✅ Verify the network is operational with new transactions

### Clean Up

Remove the cluster and all backup files:

```bash
task destroy
```

## Available Tasks

### Main Workflow Tasks

| Task | Description |
|------|-------------|
| `task` (default) | Run complete backup/restore workflow |
| `task setup` | Deploy complete network infrastructure |
| `task backup` | Freeze network and create backup |
| `task restore` | Restore from backup |
| `task verify` | Verify restored network functionality |
| `task destroy` | Remove cluster and backup files |

### Component Tasks

| Task | Description |
|------|-------------|
| `task create-cluster` | Create Kind cluster |
| `task init-solo` | Initialize Solo configuration |
| `task deploy-network` | Deploy all network components |
| `task generate-transactions` | Create test transactions |
| `task destroy-cluster` | Delete entire cluster |
| `task redeploy` | Redeploy network after cluster deletion |

## Step-by-Step Workflow

### 1. Deploy Initial Network

```bash
task setup
```

This deploys:

* 2 consensus nodes (node1, node2)
* 1 block node
* 1 mirror node
* Relay nodes for each consensus node
* 1 explorer node

### 2. Generate Network State

```bash
task generate-transactions
```

Creates 3 test accounts with 100 HBAR each to generate network state.

### 3. Create Backup

```bash
task backup
```

This will:

* Destroy the mirror node (required before freeze)
* Freeze the network
* Backup ConfigMaps, Secrets, Logs, and State files using `solo config ops backup`

**Backup Location:**

* All backup files: `./solo-backup/`

### 4. Destroy and Redeploy

```bash
# Destroy cluster
task destroy-cluster

# Redeploy fresh network
task redeploy
```

This simulates a complete disaster recovery scenario.

### 5. Restore from Backup

```bash
task restore
```

This will:

* Stop consensus nodes
* Restore ConfigMaps, Secrets, Logs, and State files using `solo config ops restore`
* Restart consensus nodes

### 6. Verify Restored Network

```bash
task verify
```

Verifies:

* All pods are running
* Previously created accounts exist (e.g., account 0.0.3)
* Network can process new transactions

## Configuration

Edit variables in `Taskfile.yml` to customize:

```yaml
vars:
  NETWORK_SIZE: "2"              # Number of consensus nodes
  NODE_ALIASES: "node1,node2"    # Node identifiers
  DEPLOYMENT: "backup-restore-deployment"
  NAMESPACE: "backup-restore-namespace"
  CLUSTER_NAME: "backup-restore-cluster"
  BACKUP_DIR: "./solo-backup"    # All backup files location
```

## What Gets Backed Up?

The `solo config ops backup` command backs up:

### ConfigMaps

* Network configuration (`network-node-data-config-cm`)
* Bootstrap properties
* Application properties
* Genesis network configuration
* Address book

### Secrets

* Node keys (TLS, signing, agreement)
* Consensus keys
* All Opaque secrets in the namespace

### Logs (from each pod)

* Account balances
* Record streams
* Statistics
* Application logs
* Network logs

### State Files (from each consensus node)

* Consensus state
* Merkle tree state
* Platform state
* Swirlds state

## Backup Directory Structure

```
solo-backup/
└── kind-backup-restore-cluster/
    ├── configmaps/
    │   ├── network-node-data-config-cm.yaml
    │   └── ...
    ├── secrets/
    │   ├── node1-keys.yaml
    │   └── ...
    └── logs/
        ├── network-node1-0.zip  (includes state files)
        └── network-node2-0.zip  (includes state files)
```

## Troubleshooting

### View Cluster Status

```bash
kubectl cluster-info --context kind-backup-restore-cluster
kubectl get pods -n backup-restore-namespace -o wide
```

### View Pod Logs

```bash
kubectl logs -n backup-restore-namespace network-node1-0 -c root-container --tail=100
```

### Open Shell in Pod

```bash
kubectl exec -it -n backup-restore-namespace network-node1-0 -c root-container -- /bin/bash
```

### Manual Cleanup

```bash
# Delete cluster
kind delete cluster -n backup-restore-cluster

# Remove backup files
rm -rf ./solo-backup

# Clean Solo cache
rm -rf ~/.solo/*
```

## Advanced Usage

### Run Individual Steps

```bash
# Deploy network only
task setup

# Generate test data
task generate-transactions

# Create backup
task backup

# Manually inspect backup
ls -lh ./solo-backup/

# Restore whenever ready (nodes must be running first)
task restore

# Verify
task verify
```

### Use Released Version of Solo

By default, the Taskfile uses the development version (`npm run solo-test --`). To use the released version:

```bash
USE_RELEASED_VERSION=true task
```

## Key Commands Used

This example demonstrates the following Solo commands:

* **`solo config ops backup`** - Backs up ConfigMaps, Secrets, Logs, and State files
* **`solo config ops restore`** - Restores ConfigMaps, Secrets, Logs, and State files
* **`solo consensus network freeze`** - Freezes the network before backup
* **`solo consensus node stop/start`** - Controls node lifecycle during restore

## Important Notes

* The network must be **frozen** before backup to ensure consistent state
* Mirror node must be **destroyed** before freezing the network
* Backup process can take several minutes depending on state size
* Restore requires nodes to be **stopped** to prevent conflicts
* Backup files can be large - ensure sufficient disk space (1GB+ per node)

## Related Examples

* [state-save-and-restore](../state-save-and-restore/) - State file management with external database
* [network-with-block-node](../network-with-block-node/) - Basic network with block node

## Support

For issues or questions:

* Solo Documentation: https://github.com/hashgraph/solo
* Task Documentation: https://taskfile.dev/
