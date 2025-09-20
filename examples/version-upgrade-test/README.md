# Version Upgrade Test Example

This example demonstrates how to deploy a complete Hedera network with previous versions of all components and then upgrade them to current versions, including testing functionality after upgrades.

## Overview

This test scenario performs the following operations:

1. **Deploy with Previous Versions**: Deploys a network with consensus nodes, block node, mirror node, relay, and explorer using previous versions
2. **Upgrade Components**: Upgrades each component individually to the current version
3. **Network Upgrade with Local Build**: Upgrades the consensus network using the `--local-build-path` flag
4. **Functionality Verification**: Creates accounts, verifies Explorer API responses, and tests Relay functionality

## Prerequisites

- Kind cluster support
- Docker or compatible container runtime
- Node.js and npm
- Task runner (`go-task/task`)
- Local Hedera consensus node build (for network upgrade with local build path)

## Usage

Navigate to the example directory:

```bash
cd examples/version-upgrade-test
```

### Run Complete Test Scenario

To run the full version upgrade test:

```bash
task
```

This will execute all steps in sequence:
1. Setup cluster and Solo environment
2. Deploy all components with previous versions
3. Upgrade each component to current version
4. Verify functionality of all components

### Individual Tasks

You can also run individual tasks:

#### Setup Cluster
```bash
task setup-cluster
```

#### Deploy with Old Versions
```bash
task deploy-old-versions
```

#### Upgrade Components
```bash
task upgrade-components
```

#### Verify Functionality
```bash
task verify-functionality
```
## Port Forwarding

The example includes setup of port forwarding for easy access to services:

- Explorer: http://localhost:8080
- Relay: http://localhost:7546
- Mirror Node: http://localhost:8081


## Verification Steps

The verification process includes:

1. **Account Creation**: Creates two accounts and captures the first account ID
2. **Explorer API Test**: Queries the Explorer REST API to verify the created account appears
3. **Relay API Test**: Makes a JSON-RPC call to the relay to ensure it's responding correctly

## Local Build Path

The network upgrade step uses the `--local-build-path` flag to upgrade the consensus network with a locally built version. Ensure you have the Hedera consensus node repository cloned and built at:

```
../hiero-consensus-node/hedera-node/data
```

You can modify the `CN_LOCAL_BUILD_PATH` variable in the Taskfile.yml if your local build is in a different location.

## Cleanup

To destroy the network and cleanup all resources:

```bash
task destroy
```

This will:
- Stop all consensus nodes
- Destroy all deployed components
- Delete the Kind cluster
- Clean up temporary files

## Troubleshooting

### Port Forward Issues
If port forwarding fails, check if the services are running:
```bash
kubectl get services -n namespace-version-upgrade-test
```

### Component Status
Check the status of all pods:
```bash
task status
```

### Service Logs
View logs for specific components:
```bash
kubectl logs -n namespace-version-upgrade-test -l app=network-node1
kubectl logs -n namespace-version-upgrade-test -l app=mirror-node
kubectl logs -n namespace-version-upgrade-test -l app=hedera-json-rpc-relay
kubectl logs -n namespace-version-upgrade-test -l app=explorer
```

### API Verification
If API verification fails, ensure port forwarding is active and services are ready:
```bash
# Check if port forwards are running
ps aux | grep port-forward

# Test connectivity manually
curl http://localhost:8080/api/v1/accounts
curl -X POST http://localhost:7546 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

## Configuration

The Taskfile.yml contains several configurable variables:

- `NODE_IDENTIFIERS`: Consensus node aliases (default: "node1,node2")
- `SOLO_NETWORK_SIZE`: Number of consensus nodes (default: "2")
- `DEPLOYMENT`: Deployment name
- `NAMESPACE`: Kubernetes namespace
- `CLUSTER_NAME`: Kind cluster name
- Version variables for current and previous versions

## Notes

- This example assumes you have the necessary permissions to create Kind clusters
- The local build path feature requires a local Hedera consensus node build
- API verification steps may need adjustment based on actual service endpoints and ingress configuration
