# Port Forward Refresh Example

This example demonstrates the `deployment refresh port-forwards` command which restores killed port-forward processes.

## Overview

The refresh command:
1. Loads the remote configuration for a deployment
2. Checks the `portForwardConfigs` metadata for each component (Consensus Nodes, Block Nodes, Mirror Nodes, Relay Nodes, Explorers)
3. Verifies if the port-forward processes are actually running
4. Re-enables any port-forward processes that are not running

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

The refresh command should:
- Detect missing port-forward processes
- Show which port-forwards are being restored
- Report the number of port-forwards checked and restored

Example output:
```
✔ Initialize
✔ Load remote configuration
✔ Checked 3 port-forward(s), restored 1
```

## Components Checked

The refresh command checks port-forwards for:
- Consensus Nodes (CN)
- Block Nodes (BN)
- Mirror Nodes (MN)
- Relay Nodes (RN)
- Explorer Nodes (EN)
