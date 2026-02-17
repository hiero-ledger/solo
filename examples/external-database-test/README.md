# External Database Test Example

This example demonstrates how to deploy a Hiero Hashgraph Solo network with an external PostgreSQL database using Kubernetes, Helm, and Taskfile automation.

## What It Does

* Creates a Kind Kubernetes cluster for local testing
* Installs the Solo CLI and initializes a Solo network
* Deploys a PostgreSQL database using Helm
* Seeds the database and configures Solo to use it as an external database for the mirror node
* Deploys mirror node, explorer, relay, and runs a smoke test
* All steps are named for clear logging and troubleshooting

## Getting This Example

### Download Archive

> **Note for unzipped release archive:** If you run tasks from an unzipped release directory (outside the Solo git repository), set `USE_RELEASED_VERSION` before running `task`:
> `export USE_RELEASED_VERSION=true`

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-external-database-test.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/external-database-test).

## Usage

1. **Install dependencies:**
   * [Task](https://taskfile.dev/)
   * [Node.js](https://nodejs.org/)
   * [npm](https://www.npmjs.com/)
   * [kubectl](https://kubernetes.io/docs/tasks/tools/)
   * [kind](https://kind.sigs.k8s.io/)
   * [Helm](https://helm.sh/)

2. **Customize your deployment:**
   * Edit `Taskfile.yml` to set database credentials, network size, and other parameters as needed.

3. **Start the network:**
   ```sh
   task
   ```
   This will:
   * Create the Kind cluster
   * Install and initialize Solo
   * Deploy and configure PostgreSQL
   * Seed the database
   * Deploy all Solo components (mirror node, explorer, relay)
   * Run a smoke test

4. **Destroy the network:**
   ```sh
   task destroy
   ```
   This will delete the Kind cluster and all resources.

## Files

* `Taskfile.yml` — Automation tasks and configuration
* `scripts/init.sh` — Script to initialize the database
* Other config files as needed for your deployment

## Notes

* All commands in the Taskfile are named for clarity in logs and troubleshooting.
* This example is self-contained and does not require files from outside this directory except for the Solo CLI npm package.
* You can extend the Taskfile to add more custom resources or steps as needed.
