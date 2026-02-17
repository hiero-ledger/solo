# Node Create Transaction Example

This example demonstrates how to use the node add-prepare/prepare-upgrade/freeze-upgrade/add-execute commands against a network in order to manually write a NodeCreateTransaction.

## What It Does

* Stands up a network with two existing nodes
* Runs `solo node add-prepare` to get artifacts needed for the SDK NodeCreateTransaction
* Runs a JavaScript program using the Hiero SDK JS code to run a NodeCreateTransaction
* Runs `solo consensus dev-freeze prepare-upgrade` and `solo consensus dev-freeze freeze-upgrade` to put the network into a freeze state
* Runs `solo consensus dev-node-add execute` to add network resources for a third consensus node, configures it, then restarts the network to come out of the freeze and leverage the new node
* Contains the destroy commands to bring down the network if desired

## Getting This Example

### Download Archive

> **Note for unzipped release archive:** If you run tasks from an unzipped release directory (outside the Solo git repository), set `USE_RELEASED_VERSION` before running `task`:
> `export USE_RELEASED_VERSION=true`

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-node-create-transaction.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/node-create-transaction).

## How to Use

1. **Install dependencies:**
   * Make sure you have [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [npm](https://www.npmjs.com/), [kubectl](https://kubernetes.io/docs/tasks/tools/), and [kind](https://kind.sigs.k8s.io/) installed.
   * Run `npm install` while in this directory so that the `solo-node-create-transaction.js` script will work correctly when ran
2. **Choose your Solo command:**
   * Edit `Taskfile.yml` and comment out/uncomment depending on if you want to run Solo checked out of the repository or running Solo with an NPM install
     * `SOLO_COMMAND: "npm run solo --"`: use this if running with solo source repository
     * `SOLO_COMMAND: "solo"`: use this if running with installed version of Solo
3. **Provide your custom `application.properties` if desired:**
   * The following code is provided as an example and can be modified:
     ```
         # Copy and update application.properties
         cp resources/templates/application.properties {{ .APPLICATION_PROPERTIES }}
         echo "contracts.evm.ethTransaction.zeroHapiFees.enabled=false" >> {{ .APPLICATION_PROPERTIES }}
     ```
   * `resources/templates/application.properties` is the location of the Solo customized `application.properties` if you are sitting in the root of the Solo repository directory
   * You can download a copy here: <https://github.com/hiero-ledger/solo/blob/main/resources/templates/application.properties>
   * If you want you can download a copy, add your configurations, (be careful changing existing configurations as it could break Solo's network), and then update the variable at the top to point to the new location: `APPLICATION_PROPERTIES: "{{ .TEMPORARY_DIR }}/application.properties"`
4. **CN\_VERSION:**
   * The following is only used for certain decision logic.  It is best to have it as close to possible as the local build you are using of consensus node: `CN_VERSION: "v0.66.0"`
   * The script is configured to leverage a local build of the Consensus Node, for example the `main` branch.  You will need to clone the Hiero Consensus Node yourself and then from its root directory run `./gradlew assemble`, this assumes you have all its prerequisites configured, see: <https://github.com/hiero-ledger/hiero-consensus-node/blob/main/docs/README.md>
5. **Updating Directory Locations**
   * The script was designed to run from this directory and so if you copy down the example without the repository or change other locations you might need to make changes
   * The `dir: ../..` setting says to run the script two directories above, `CN_LOCAL_BUILD_PATH` can be updated to be relative to that, or can be changed to have the full path to the consensus node directory
   * The `CN_LOCAL_BUILD_PATH` actually points to the `<hiero-consensus-node>/hedera-node/data`, this is because this is the location of the artifacts that Solo needs to upload to the network node
6. **Run the default workflow:**
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
     * Perform the consensus node add as described in the 'What It Does' section above
7. **Destroy the network:**
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
* `package.json` - Contains the libraries for the `solo-node-create-transaction.js` to function
* `package-lock.json` - A snapshot of what was last used when `npm install` was ran, run `npm ci` to install these versions specifically
* `solo-node-create-transaction.js` - The script to run the Hiero SDK JS calls

## Notes

* This example is **self-contained** and does not require files from outside this directory.
* All steps in the workflow are named for clear logging and troubleshooting.
* You can extend the Taskfile to add more custom resources or steps as needed.
* For more advanced usage, see the main [Solo documentation](https://github.com/hiero-ledger/solo).
