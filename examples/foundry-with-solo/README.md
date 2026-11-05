# Foundry with Solo Example

This example deploys a Hiero network with `solo one-shot single deploy`, points a [Foundry](https://getfoundry.sh/) project at the network's JSON-RPC relay, and uses `forge` and `cast` to deploy, call and test a smart contract.

## What It Does

* Installs the Solo CLI and creates a Solo deployment with `one-shot`
* Installs `forge-std` into `lib/` and compiles `contracts/SimpleStorage.sol` with `forge build`
* Deploys `SimpleStorage` to Solo with `forge create`, then reads and updates it with `cast call` and `cast send`
* Runs `forge test` against a fork of the Solo relay, including a test that reads the contract deployed above

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-foundry-with-solo.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/foundry-with-solo).

## Usage

1. **Install dependencies:**
   * [Task](https://taskfile.dev/) (3.45 or later on Windows, which provides the `rm` and `cat` the Taskfile uses)
   * [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/)
   * [Foundry](https://getfoundry.sh/introduction/installation/) 1.8 or later (`forge` and `cast`)
   * [Git](https://git-scm.com/downloads) (used by `forge install`)
   * [jq](https://jqlang.org/download/)

   The Taskfile runs in Task's built-in shell and needs no other Unix tools, so it works on Linux, macOS and Windows.

2. **Start the deployment and run the tests:**
   ```sh
   task
   ```
   This will:
   * Create a Solo deployment via `one-shot`, install all dependencies (`kubectl`, `helm`, `kind`), create a cluster and install all Solo components (mirror node, explorer, relay)
   * Deploy `SimpleStorage` with `forge create` and interact with it using `cast`
   * Run `forge test`

   To rerun only the Foundry steps against a network that is already running, use `task test`. A bare `forge test` fails `test_ReadsContractDeployedToSolo` unless `SIMPLE_STORAGE_ADDRESS` and `SIMPLE_STORAGE_VALUE` are set; `task test` deploys the contract and sets both.

3. **Destroy the deployment:**
   ```sh
   task destroy
   ```
   This will delete the Solo deployment and all resources.

## Files

* `Taskfile.yml` — Automation tasks and configuration
* `foundry.toml` — Foundry configuration that makes `forge test` fork the Solo relay on `http://localhost:37546`
* `contracts/SimpleStorage.sol` — Sample Solidity contract, a copy of the one in the `hardhat-with-solo` example
* `test/SimpleStorage.t.sol` — Forge tests that run against a fork of the Solo deployment

## Foundry Configuration

`solo one-shot single deploy` port-forwards the JSON-RPC relay to `http://localhost:37546`; the network's chain id is `298`. Setting `eth_rpc_url` in `foundry.toml` makes `forge test` fork the Solo network. The Taskfile still passes `--rpc-url` to `forge create` and `cast`, so every command that talks to the network shows which endpoint it uses.

`forge test` runs every test in a local EVM that loads state from the relay on demand. Contracts the tests create and every state change stay in that fork; to change the Solo network itself, send transactions with `forge create` or `cast send` as the Taskfile does.

`one-shot` creates three groups of accounts with predefined private keys. Use the accounts in the `ECDSA Alias Accounts (EVM compatible)` group with `--private-key`. The account data is in the output of the deploy command and in `$SOLO_HOME/one-shot-$DEPLOYMENT_NAME/accounts.json`.

## Notes

* The Taskfile deploys without a block node (`ONE_SHOT_WITH_BLOCK_NODE=false`). When the mirror node imports from a block node, the relay returns contract deployment receipts without `contractAddress`, and `forge create` fails with `contract was not deployed` even though the contract was deployed ([hiero-mirror-node#14473](https://github.com/hiero-ledger/hiero-mirror-node/issues/14473)).
* Forking the relay requires Foundry 1.8 or later together with JSON-RPC relay 0.80.0 or later, which added the EIP-1898 block parameters that Foundry sends.
* This example covers `forge build`, `forge create`, `forge test` and `cast`. `forge script` is not covered because it has known limitations on Hedera when it broadcasts multiple transactions.
* The example is self-contained and does not require files from outside this directory except for the Solo CLI npm package.
