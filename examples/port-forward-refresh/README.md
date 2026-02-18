# Port Forward Refresh Example

This example demonstrates the `deployment refresh port-forwards` command which restores killed port-forward processes.

## Overview

The refresh command:
1. Loads the remote configuration for a deployment
2. Checks the `portForwardConfigs` metadata for each component (Consensus Nodes, Block Nodes, Mirror Nodes, Relay Nodes, Explorers)
3. Verifies if the port-forward processes are actually running
4. Re-enables any port-forward processes that are not running
5. Provides clear output showing:
   - Which port-forwards are already running
   - Which port-forwards are missing and being restored
   - Summary of total configured, running, and restored port-forwards

## Use Case

After running Solo for a while, some port-forward processes may be accidentally killed or terminated. Instead of redeploying the entire network, you can use the refresh command to restore just the port-forward processes.

## Prerequisites

- [Kind](https://kind.sigs.k8s.io/) installed
- [Task](https://taskfile.dev/) installed (or run commands manually)

## Usage

### Option 1: Using Task (Recommended)

Run the complete test workflow:

```bash
cd examples/port-forward-refresh
task test
```

This will:
1. Deploy a test network with consensus node, mirror node, and block node
2. Kill one random port-forward process
3. Run the refresh command
4. Verify all port-forwards are restored

Run the smoke test (verifies refresh works when all port-forwards are already running):

```bash
cd examples/port-forward-refresh
task smoke-test
```

This will:
1. Deploy a test network
2. Run the refresh command with all port-forwards already running
3. Verify the command correctly reports everything is working

Run the full Solo smoke test suite:

```bash
cd examples/port-forward-refresh
task solo-smoke-test
```

This will:
1. Deploy a test network with all required components (consensus, mirror, relay, explorer, block nodes)
2. Execute the comprehensive Solo smoke test from `.github/workflows/script/solo_smoke_test.sh`
3. Verify smart contracts, JavaScript SDK, and mirror node functionality

To clean up:

```bash
task destroy
```

### Option 2: Manual Testing

1. Deploy the network:
```bash
task deploy
```

2. List current port-forwards:
```bash
ps -ef | grep "port-forward" | grep -v grep
```

3. Kill one port-forward process (replace PID with actual process ID):
```bash
kill -9 <PID>
```

4. Run the refresh command:
```bash
solo deployment refresh port-forwards --deployment port-forward-test-deployment
```

5. Verify the port-forward was restored:
```bash
ps -ef | grep "port-forward" | grep -v grep
```

6. Clean up:
```bash
task destroy
```

## Expected Output

The refresh command provides detailed output showing:

### When port-forwards need to be restored:
```
=== Port-Forward Status Check ===

✓ ConsensusNode 0: localhost:50211 -> pod:50211 [Running]
⚠ BlockNode 1: localhost:8080 -> pod:8080 [Missing]
  ↳ Restored port forward for BlockNode 1

=== Summary ===
Total port-forwards configured: 2
Already running: 1
Successfully restored: 1
```

### When all port-forwards are already running:
```
=== Port-Forward Status Check ===

✓ ConsensusNode 0: localhost:50211 -> pod:50211 [Running]
✓ BlockNode 1: localhost:8080 -> pod:8080 [Running]

=== Summary ===
Total port-forwards configured: 2
Already running: 2
✓ All port-forwards are running correctly
```

## Components Checked

The refresh command checks port-forwards for:
- Consensus Nodes (CN)
- Block Nodes (BN)
- Mirror Nodes (MN)
- Relay Nodes (RN)
- Explorer Nodes (EN)
