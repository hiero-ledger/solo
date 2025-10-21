# State Save and Restore Example

This example demonstrates how to save network state from a running Solo network, recreate a new network, and load the saved state with a mirror node. It also includes optional external database configuration.

## What it does

* Creates an initial Solo network with consensus nodes and mirror node
* Runs transactions to generate state
* Downloads and saves the network state
* Destroys the initial network
* Creates a new network with the same configuration
* Restores the saved state to the new network
* Optionally uses an external PostgreSQL database for the mirror node

## Prerequisites

* [Kind](https://kind.sigs.k8s.io/) - Kubernetes in Docker
* [kubectl](https://kubernetes.io/docs/tasks/tools/) - Kubernetes CLI
* [Node.js](https://nodejs.org/) - JavaScript runtime
* [Task](https://taskfile.dev/) - Task runner
* [Helm](https://helm.sh/) - Kubernetes package manager (for external database option)

## Quick Start

### Basic Workflow (5 commands)

```bash
task setup          # 1. Deploy initial network (5-10 min)
task save-state     # 2. Save current state (2-5 min)
task restore        # 3. Recreate and restore (3-5 min)
task status         # 4. Check status
task destroy        # 5. Cleanup
```

### With External Database

```bash
task setup-with-external-db
task save-state-with-db
task restore-with-db
task destroy
```

## Usage

### Option 1: Basic State Save and Restore (with embedded database)

1. **Deploy initial network with state**
   ```sh
   task setup
   ```
   This will:
   * Create a Kind cluster
   * Initialize Solo
   * Deploy a consensus network with 3 nodes
   * Deploy mirror node with embedded database
   * Run sample transactions to generate state

2. **Save network state**
   ```sh
   task save-state
   ```
   This will:
   * Download state from all consensus nodes
   * Save state files to `./saved-states/` directory
   * Display saved state information

3. **Recreate network and restore state**
   ```sh
   task restore
   ```
   This will:
   * Stop and destroy the existing network
   * Create a new network with the same configuration
   * Upload the saved state to the new consensus nodes
   * Start the nodes with restored state
   * Verify the restored state

### Option 2: With External PostgreSQL Database

1. **Deploy initial network with external database**
   ```sh
   task setup-with-external-db
   ```
   This will:
   * Create a Kind cluster
   * Deploy PostgreSQL database
   * Initialize Solo
   * Deploy consensus network
   * Deploy mirror node connected to external database
   * Run sample transactions

2. **Save state and database**
   ```sh
   task save-state-with-db
   ```
   This will:
   * Download consensus node state
   * Export database dump
   * Save both to `./saved-states/` directory

3. **Restore with database**
   ```sh
   task restore-with-db
   ```
   This will:
   * Stop and destroy existing network
   * Recreate PostgreSQL database
   * Import database dump
   * Create new consensus network
   * Upload saved state
   * Reconnect mirror node to database

### Cleanup

```sh
task destroy
```

This will delete the Kind cluster and clean up all resources.

## Tasks

* `setup` - Deploy initial network with embedded database
* `setup-with-external-db` - Deploy initial network with external PostgreSQL
* `generate-transactions` - Run sample transactions to create state
* `save-state` - Download and save consensus node state
* `save-state-with-db` - Save state and export database
* `restore` - Recreate network and restore saved state
* `restore-with-db` - Restore network with external database
* `verify-state` - Verify restored state matches original
* `destroy` - Delete cluster and clean up

## Customization

You can adjust settings by editing the `vars:` section in `Taskfile.yml`:

* `NETWORK_SIZE` - Number of consensus nodes (default: 3)
* `STATE_SAVE_DIR` - Directory to save state files (default: ./saved-states)
* `POSTGRES_PASSWORD` - PostgreSQL password for external database
* `NODE_ALIASES` - Node identifiers

## State Files

Saved state files are stored in `./saved-states/` with the following structure:

```
saved-states/
├── node1-state.zip
├── node2-state.zip
├── node3-state.zip
├── metadata.json          # Network configuration metadata
└── database-dump.sql      # Optional: database export
```

## How It Works

### State Saving Process

1. **Download State**: Uses `solo consensus state download` to download signed state from each consensus node
2. **Save Metadata**: Stores network configuration (node count, aliases, versions) for recreation
3. **Optional DB Export**: If using external database, exports PostgreSQL database dump

### State Restoration Process

1. **Network Recreation**: Creates new network with identical configuration
2. **State Upload**: Uploads saved state files to new consensus nodes using `solo consensus node start --state-file`
3. **Database Restore**: If using external database, imports database dump before connecting mirror node
4. **Verification**: Checks that restored state matches original

## Notes

* State files can be large (several GB per node) depending on network activity
* Ensure sufficient disk space in `./saved-states/` directory
* External database option provides better data persistence and queryability
* State restoration maintains transaction history and account balances
* Mirror node will resume from the restored state point

## Useful Commands

### Check Status
```bash
task status
```

### View Logs
```bash
# Consensus node logs
kubectl logs -n state-restore-namespace network-node1-0 -f

# Mirror node logs
kubectl logs -n state-restore-namespace mirror-node-<pod-name> -f

# Database logs
kubectl logs -n database state-restore-postgresql-0 -f
```

### Manual State Operations
```bash
# Download state manually
npm run solo --silent -- consensus state download --deployment state-restore-deployment --node-aliases node1

# Check saved state files
ls -lh ./saved-states/

# View metadata
cat ./saved-states/metadata.json
```

## Expected Timeline

* Initial setup: 5-10 minutes
* State download: 2-5 minutes (depends on state size)
* Network restoration: 3-5 minutes
* Total workflow: ~15-20 minutes

## File Sizes

Typical state file sizes:
* Small network (few transactions): 100-500 MB per node
* Medium activity: 1-3 GB per node
* Heavy activity: 5-10+ GB per node

Ensure you have sufficient disk space in `./saved-states/` directory.

## Advanced Usage

### Save State at Specific Time
Run `task save-state` at any point after running transactions. The state captures the network at that moment.

### Restore to Different Cluster
1. Save state on cluster A
2. Copy `./saved-states/` directory to cluster B
3. Run `task restore` on cluster B

### Multiple State Snapshots
```bash
# Save multiple snapshots
task save-state
mv saved-states saved-states-backup1

# Later...
task save-state
mv saved-states saved-states-backup2

# Restore specific snapshot
mv saved-states-backup1 saved-states
task restore
```

## Troubleshooting

**State download fails**:
- Ensure nodes are running and healthy
- Check pod logs: `kubectl logs -n <namespace> <pod-name>`
- Increase timeout or download nodes sequentially

**Restore fails**:
- Verify state files exist in `./saved-states/`
- Check file permissions
- Ensure network configuration matches original
- Check state file integrity

**Database connection fails**:
- Verify PostgreSQL pod is ready
- Check credentials in Taskfile.yml
- Review PostgreSQL logs

**Out of disk space**:
- Clean old state files with `task clean-state`
- Check available disk space before saving state

### Debugging Commands
```bash
# Check pod status
kubectl get pods -n state-restore-namespace

# Describe problematic pod
kubectl describe pod <pod-name> -n state-restore-namespace

# Get pod logs
kubectl logs <pod-name> -n state-restore-namespace

# Access database shell
kubectl exec -it state-restore-postgresql-0 -n database -- psql -U postgres -d mirror_node
```

## Example Output

```bash
$ task setup
✓ Create Kind cluster
✓ Initialize Solo
✓ Deploy consensus network (3 nodes)
✓ Deploy mirror node
✓ Generate sample transactions
Network ready at: http://localhost:5551

$ task save-state
✓ Downloading state from node1... (2.3 GB)
✓ Downloading state from node2... (2.3 GB)
✓ Downloading state from node3... (2.3 GB)
✓ Saving metadata
State saved to: ./saved-states/

$ task restore
✓ Stopping existing network
✓ Creating new network
✓ Uploading state to node1...
✓ Uploading state to node2...
✓ Uploading state to node3...
✓ Starting nodes with restored state
✓ Verifying restoration
State restored successfully!
```

***

This example is self-contained and does not require files from outside this directory.
