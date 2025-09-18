# Custom Network Config Example

This example demonstrates how to create and manage a custom Hiero Hashgraph Solo deployment and configure it with custom settings.

## What It Does

* **Defines a custom network topology** (number of nodes, namespaces, deployments, etc.)
* **Provides a Taskfile** for automating cluster creation, deployment, key management, and network operations
* **Supports local development and testing** of Hedera network features
* **Can be extended** to include mirror nodes, explorers, and relays

## How to Use

1. **Install dependencies:**
   * Make sure you have [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [npm](https://www.npmjs.com/), [kubectl](https://kubernetes.io/docs/tasks/tools/), and [kind](https://kind.sigs.k8s.io/) installed.
2. **Customize your network:**
   * Edit `Taskfile.yml` to set the desired network size, namespaces, and other parameters.
3. **Run the default workflow:**
   * From this directory, run:
     ```sh
     task
     ```
   * This will:
     * Install the Solo CLI
     * Create a Kind cluster
     * Set the kubectl context
     * Initialize Solo
     * Connect and set up the cluster reference
     * Create and configure the deployment
     * Add the cluster to the deployment
     * Generate node keys
     * Deploy the network with custom configuration files
     * Set up and start nodes
     * Deploy mirror node, relay, and explorer
4. **Destroy the network:**
   * Run:
     ```sh
     task destroy
     ```
   * This will:
     * Stop all nodes
     * Destroy mirror node, relay, and explorer
     * Destroy the Solo network
     * Delete the Kind cluster

## Files

* `Taskfile.yml` — All automation tasks and configuration
* `init-containers-values.yaml`, `settings.txt`, `log4j2.xml`, `application.properties` — Example config files for customizing your deployment

## Notes

* This example is **self-contained** and does not require files from outside this directory.
* All steps in the workflow are named for clear logging and troubleshooting.
* You can extend the Taskfile to add more custom resources or steps as needed.
* For more advanced usage, see the main [Solo documentation](https://github.com/hashgraph/solo).
