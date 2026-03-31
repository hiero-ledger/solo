# One-Shot EVM Deployment Example

This example demonstrates how to use the Solo **one-shot single deploy --evm** command to quickly deploy a complete Hiero Hashgraph network optimised for EVM / smart-contract developers.

## What It Does

* **Deploys a complete EVM-ready network stack** with a consensus node, mirror node, JSON-RPC relay, and mirror-node explorer in one command
* **Creates 20 pre-funded ECDSA alias accounts** (1 000 000 HBAR each) whose private keys are printed to stdout and saved to `~/.solo/one-shot-<deployment>/accounts.json`
* **Provides JSON-RPC relay** that MetaMask, ethers.js, Hardhat, and other EVM tooling can connect to directly
* **Supports four deploy variants** to control which optional components are included
* **Provides quick teardown** with the destroy command
* **Ideal for smart-contract development and testing** workflows

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-one-shot-evm.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/one-shot-evm).

## How to Use

1. **Install dependencies:**
   * Make sure you have [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [npm](https://www.npmjs.com/), [kubectl](https://kubernetes.io/docs/tasks/tools/), and [kind](https://kind.sigs.k8s.io/) installed.

2. **Deploy the network (default — with mirror-node explorer):**
   * From this directory, run:
     ```sh
     task deploy
     ```
   * This will:
     * Install the Solo CLI (if `USE_RELEASED_VERSION=true`)
     * Deploy the complete EVM network using `solo one-shot single deploy --evm`
     * Print 20 pre-funded ECDSA account private keys to stdout

3. **Deploy variants:**

   | Task | Command | Description |
   |------|---------|-------------|
   | `task deploy` | `--evm` | Consensus node + mirror node + relay + explorer (default) |
   | `task deploy-no-explorer` | `--evm --skip-explorer` | Consensus node + mirror node + relay only |
   | `task deploy-explorer-mirror-node` | `--evm --explorer mirror-node` | Explicitly selects mirror-node explorer |
   | `task deploy-explorer-blockscout` | `--evm --explorer blockscout` | Requests Blockscout (falls back to mirror-node) |

4. **Destroy the network:**
   * Run:
     ```sh
     task destroy
     ```
   * This will:
     * Destroy the Solo network using `solo one-shot single destroy`
     * Delete the Kind cluster

5. **CI entry-point:**
   * Run `task` with no arguments to cycle through all four deploy variants, verifying component expectations after each one, then destroying the cluster.

## Files

* `Taskfile.yml` — Automation tasks for all deploy variants, post-deploy checks, and destroy

## Pre-Funded Accounts

After deployment, 20 ECDSA alias accounts with `0x…` public-key aliases are available. Account details are saved to:

```
~/.solo/one-shot-<deployment>/accounts.json
```

The JSON structure contains a `createdAccounts` array where entries with `"group": "ecdsa-alias"` are the EVM-compatible accounts.

## Notes

* The **JSON-RPC relay** listens on a forwarded local port — connect MetaMask or your EVM tooling to `http://localhost:<relay-port>`
* The **mirror-node REST API** is available at `http://localhost:<mirror-node-port>`
* The **explorer** UI is available at `http://localhost:<explorer-port>` (when deployed)
* This is perfect for CI/CD pipelines and automated smart-contract testing
* For more advanced customization, see the main [Solo documentation](https://github.com/hiero-ledger/solo)

## Component Deployment Toggles

* `--skip-explorer` — Omit the explorer (reduces resource usage)
* `--explorer mirror-node` — Explicitly select the mirror-node explorer
* `--explorer blockscout` — Request Blockscout explorer (currently falls back to mirror-node)
