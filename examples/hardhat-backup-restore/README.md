# Hardhat Backup, Reset and Restore Example

This example shows how a `hardhat` developer can save a Solo network, throw the environment away, and bring the
same ledger state back. It addresses [issue #3298](https://github.com/hiero-ledger/solo/issues/3298) and is
intended as guidance for using backup/restore in a test harness.

## What It Does

* Creates a Kind cluster and deploys a two-node network with block, mirror (external database), relay and explorer nodes, then funds
  the accounts `hardhat` signs with
* Deploys a `SimpleStorage` contract with `hardhat` and stores a value (`pre-backup-test`)
* Freezes the network and creates a backup with `solo config ops backup` (`backup`)
* Deletes all Kind clusters and the local Solo configuration (`reset`)
* Recreates the cluster, network and consensus state with `solo config ops restore-clusters`, `restore-network`,
  `restore-config` and `consensus node start` (`restore`)
* Verifies with `hardhat` that the contract and its stored value survived, and that new transactions work
  (`post-restore-test`)

## Getting This Example

Browse the source on [GitHub](https://github.com/hiero-ledger/solo/tree/main/examples/hardhat-backup-restore), or
download `example-hardhat-backup-restore.zip` from the
[Solo releases page](https://github.com/hiero-ledger/solo/releases).

## Usage

1. Install [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), Docker, `kind`, `kubectl` and `helm`.
2. Run the whole workflow:
   ```sh
   task
   ```
   Individual steps can be run on their own (`task backup`, `task reset`, `task restore`, ...); see `task --list`.
3. Clean up:
   ```sh
   task destroy
   ```

## Files

* `Taskfile.yml` — Automation tasks and configuration
* `command.yaml` — Per-component options used by `restore-network`
* `hardhat-example/` — `hardhat` project; `test/pre-backup.ts` writes state and `test/post-restore.ts` verifies it

## Using This in a Test Harness

* Freeze the network before `config ops backup` so the saved state is consistent.
* Wait for a fresh signed state snapshot after your last transaction before freezing (the `backup` task sleeps
  120s). The freeze state itself is not signed, so the backup uses the newest signed periodic snapshot; a
  transaction newer than that snapshot is lost from the ledger while the mirror database still contains it.
* Back up once after seeding the ledger with the contracts and accounts your tests need, then run
  `reset` + `restore` before each test run to start from the same known state.
* Backup/restore requires the mirror node to use an external database (deployed here in the `database` namespace);
  the restore recreates it with `restore-db` before `restore-network`, so mirror and relay start with data.
* The backup is a plain directory (plus an optional encrypted zip), so it can be cached between CI runs.
* `--deployment` is required on `backup` and `restore-config` in this example; the deployment name is fixed to
  `hardhat-backup-restore`.
