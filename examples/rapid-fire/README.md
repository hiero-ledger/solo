# Rapid-Fire Example

This example demonstrates how to deploy a minimal Hiero Hashgraph Solo network and run a suite of rapid-fire load tests against it using the Solo CLI.

## What It Does

* **Automates deployment** of a single-node Solo network using Kubernetes Kind
* **Runs rapid-fire load tests** for:
  * Crypto transfers
  * Token transfers
  * NFT transfers
  * Smart contract calls
  * HeliSwap operations
  * Longevity (endurance) testing
* **Cleans up** all resources after testing

## Getting This Example

### Download Archive

> **Note for unzipped release archive:** If you run tasks from an unzipped release directory (outside the Solo git repository), set `USE_RELEASED_VERSION` before running `task`:
> `export USE_RELEASED_VERSION=true`

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-rapid-fire.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/rapid-fire).

## Prerequisites

* [Task](https://taskfile.dev/)
* [Node.js](https://nodejs.org/)
* [npm](https://www.npmjs.com/)
* [kubectl](https://kubernetes.io/docs/tasks/tools/)
* [kind](https://kind.sigs.k8s.io/)

## How to Use

1. **Install dependencies** (if not already installed):
   * See the prerequisites above.
2. **Run the default workflow:**
   * From this directory, run:
     ```sh
     task
     ```
   * This will:
     * Install the Solo CLI
     * Create a Kind cluster
     * Deploy a single-node Solo network
     * Run all rapid-fire load tests
3. **Destroy the network:**
   * Run:
     ```sh
     task destroy
     ```
   * This will:
     * Stop all nodes
     * Destroy the Solo network
     * Delete the Kind cluster

## Files

* `Taskfile.yml` — Automation for deployment, testing, and cleanup
* `nlg-values.yaml` — Example values file for load tests (if present)

## Notes

* This example is self-contained and does not require files from outside this directory.
* You can customize the load test parameters in `Taskfile.yml`.
* For more advanced usage, see the main [Solo documentation](https://github.com/hiero-ledger/solo).
