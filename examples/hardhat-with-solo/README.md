# External Database Test Example

This example demonstrates how to deploy a Hiero Hashgraph Solo deployment via the `one-shot` command, configure a `hardhat` project to connect to it, and run tests against the local Solo deployment.

## What It Does

* Installs the Solo CLI and initializes a Solo deployment
* Installs `hardhat` and configures it to connect to the local Solo deployment
* Runs sample tests against the Solo deployment

## Usage

1. **Install dependencies:**
   * [Task](https://taskfile.dev/)
   * [Node.js](https://nodejs.org/)
   * [npm](https://www.npmjs.com/)

2. **Customize your deployment:**
   * Edit `Taskfile.yml` to set database credentials, network size, and other parameters as needed.

3. **Start the deployment:**
   ```sh
   task
   ```
   This will:
   * Create the Kind cluster
   * Install and initialize Solo
   * Create a Solo deployment via `one-shot`, install all dependencies (`kubectl`, `helm`, `kind`), create a cluster and install all Solo components (mirror node, explorer, relay)
   * Configure `hardhat` to connect to the local Solo deployment
   * Run a smoke test

4. **Destroy the deployment:**
   ```sh
   task destroy
   ```
   This will delete the Solo deployment and all resources.

## Files

* `Taskfile.yml` — Automation tasks and configuration
* `hardhat-example/hardhat.config.ts` — Configuration file for `hardhat` to connect to the local Solo deployment
* `hardhat-example/contracts/SimpleStorage.sol` — Sample Solidity contract to deploy to the Solo deployment
* `hardhat-example/test/SimpleStorage.ts` — Sample test file to run against the Solo deployment

## Hardhat Configuration

When creating a deployment with `solo one-shot single deploy` three groups of accounts with predefined private keys is generated. The accounts from the group `ECDSA Alias Accounts (EVM compatible)` can be used by `hardhat`.
The account data can be found in the output of the command and in `$SOLO_HOME/one-shot-$DEPLOYMENT_NAME/accounts.json`.

Examine the contents of the `hardhat-example/hardhat.config.ts` file to see how to configure the network and accounts.

## Notes

* All commands in the Taskfile are named for clarity in logs and troubleshooting.
* This example is self-contained and does not require files from outside this directory except for the Solo CLI npm package.
* You can extend the Taskfile to add more custom resources or steps as needed.
