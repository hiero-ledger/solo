# WRAPs E2E Test Example

This example deploys a 3-node Hiero network with TSS (Threshold Signature Scheme) and WRAPs (recursive WRAPs aggregation for hinTS) enabled, then verifies that blocks are being produced with TSS signatures via the mirror node REST API.

WRAPs is a cryptographic protocol that enables efficient threshold signature aggregation. This example serves as the automated E2E test for [issue #3761](https://github.com/hiero-ledger/solo/issues/3761) — verifying that WRAPs is not broken by Solo changes.

## What it does

* Creates a Kind cluster with 3 consensus nodes for a meaningful TSS threshold (2-of-3)
* Deploys a block node with TSS message sizing applied (`--block-node-tss-overlay`)
* Deploys the consensus network with `--tss` and `--wraps` flags enabled
* Waits for TSS to bootstrap and the WRAPs genesis proof to be produced
* Deploys mirror node and relay
* Verifies that blocks are flowing through the network (confirming WRAPs/TSS is operational)

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-wraps-e2e-test.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/wraps-e2e-test).

## Prerequisites

* [Kind](https://kind.sigs.k8s.io/) - Kubernetes in Docker
* [kubectl](https://kubernetes.io/docs/tasks/tools/) - Kubernetes CLI
* [Node.js](https://nodejs.org/) - JavaScript runtime (v22+)
* [Task](https://taskfile.dev/) - Task runner
* Consensus Node **>= v0.72.0** — required for TSS (`--tss`) and WRAPs (`--wraps`) support

> **Note**: This example requires at least 16 GB of memory allocated to Docker due to the block node and 3 consensus nodes.

## Quick Start

```bash
task          # Deploy network + verify WRAPs is working
task destroy  # Cleanup when done
```

## Available Tasks

| Task | Description |
|------|-------------|
| `default` | Run `deploy` then `verify` |
| `deploy` | Deploy the full network with TSS and WRAPs enabled |
| `verify` | Poll mirror node to confirm blocks are produced by WRAPs/TSS |
| `destroy` | Tear down all components and delete the Kind cluster |

## Usage

### 1. Deploy the Network

```bash
task deploy
```

This will:

* Create a Kind cluster (`wraps-e2e-cluster`)
* Initialize Solo and connect the cluster reference
* Add a block node with TSS message sizing (`--block-node-tss-overlay`)
* Generate gossip and TLS keys for 3 consensus nodes
* Deploy the consensus network with `--tss --wraps` enabled
* Setup and start all 3 consensus nodes (Solo waits for TSS to become ready)
* Deploy the mirror node and JSON-RPC relay

### 2. Verify WRAPs is Working

```bash
task verify
```

This will:

* Poll the mirror node REST API (`/api/v1/blocks`) until blocks appear (up to 5 minutes)
* Confirm the latest block number is > 0, proving that WRAPs/TSS signed blocks are flowing

### 3. Cleanup

```bash
task destroy
```

This will stop all components and delete the Kind cluster.

## Customization

Edit the `vars:` section in `Taskfile.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ALIASES` | `node1,node2,node3` | Consensus node identifiers |
| `NETWORK_SIZE` | `3` | Number of consensus nodes |
| `CN_VERSION` | `latest` | Consensus node version (must be >= v0.72.0); override via `CONSENSUS_NODE_VERSION` env var |
| `MIRROR_NODE_VERSION_FLAG` | _(empty)_ | Optional `--mirror-node-version vX.Y.Z` flag |
| `BLOCK_NODE_VERSION_FLAG` | _(empty)_ | Optional block node version flag |
| `MIRROR_NODE_REST_PORT` | `8081` | Local port for the mirror node REST API |

## How It Works

### TSS and WRAPs Flags

The key flags passed to `solo consensus network deploy` are:

```bash
solo consensus network deploy \
  --tss   \  # enables hinTS (tss.hintsEnabled=true, tss.historyEnabled=true)
  --wraps    # enables WRAPs aggregation (tss.wrapsEnabled=true); requires CN >= v0.72.0
```

When WRAPs is enabled, the consensus node generates a ~30 MiB genesis WRAPs proof during the first round of TSS bootstrapping. The block node TSS overlay (`--block-node-tss-overlay`) ensures the block node is configured with the larger message size limits needed to receive this proof:

* Soft limit: 4 MiB
* Hard limit: 36 MiB

### Verification Approach

The verify step polls the mirror node REST API:

```bash
curl http://127.0.0.1:8081/api/v1/blocks?limit=1&order=desc
```

If blocks are present (block number > 0), it means:
1. The consensus nodes successfully bootstrapped TSS
2. WRAPs produced the genesis threshold proof
3. The block node received and stored the blocks
4. The mirror node ingested the blocks from the block node

### Deployment Order

Block node must be deployed **before** the consensus network so that:
1. The block node is registered in the remote config before network deploy
2. The `blockNodes.json` written to consensus nodes points to the correct block node address
3. TSS message size limits are applied correctly from the start

## Troubleshooting

**TSS never becomes ready / `consensus node start` times out:**

* Check CN version is >= v0.72.0: `echo $CONSENSUS_NODE_VERSION`
* Inspect CN logs: `kubectl logs -n wraps-e2e-namespace network-node1-0 -c root-container --tail=200`
* Look for `TSS_LIB_WRAPS_ARTIFACTS_PATH` in env: `kubectl exec -n wraps-e2e-namespace network-node1-0 -- env | grep TSS`

**Mirror node never ingests blocks:**

* Verify block node is running: `kubectl get pods -n wraps-e2e-namespace | grep block-node`
* Check block node logs: `kubectl logs -n wraps-e2e-namespace -l app.kubernetes.io/name=block-node-1 --tail=200`
* Check mirror node importer logs: `kubectl logs -n wraps-e2e-namespace -l app.kubernetes.io/component=importer --tail=200`

**Out of memory / pods evicted:**

* Ensure Docker has at least 16 GB RAM allocated
* Try reducing `NETWORK_SIZE` to `1` for a smoke test (note: single-node TSS does not require threshold)

**Debugging commands:**

```bash
# Check all pods
kubectl get pods -n wraps-e2e-namespace

# View consensus node logs (look for TSS/WRAPs activity)
kubectl logs -n wraps-e2e-namespace network-node1-0 -c root-container --tail=500

# View block node logs
kubectl logs -n wraps-e2e-namespace -l app.kubernetes.io/name=block-node-1 --tail=500

# Query mirror node directly
curl -s http://127.0.0.1:8081/api/v1/blocks?limit=5&order=desc | jq .

# Collect Solo diagnostics
npm run solo -- deployment diagnostics logs --deployment wraps-e2e-deployment --dev
```

## Expected Timeline

* Cluster creation + Solo init: ~2 minutes
* Block node + key generation: ~2 minutes
* Consensus network deploy + TSS bootstrap: ~8–12 minutes (WRAPs genesis proof is large)
* Mirror node + relay deploy: ~3 minutes
* Verification: ~1–5 minutes
* **Total**: ~15–25 minutes

## Related

* [hiero-ledger/solo issue #3761](https://github.com/hiero-ledger/solo/issues/3761) — E2E test for WRAPs
* [Block Node E2E reference workflow](https://github.com/hiero-ledger/hiero-block-node/blob/main/.github/workflows/solo-e2e-test.yml) — the workflow this example is modeled after

***

This example is self-contained and does not require files from outside this directory.
