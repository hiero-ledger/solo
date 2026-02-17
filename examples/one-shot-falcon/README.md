# One-Shot Falcon Deployment Example

This example demonstrates how to use the Solo **one-shot falcon** commands to quickly deploy and destroy a complete Hiero Hashgraph network with all components in a single command.

## What It Does

* **Deploys a complete network stack** with consensus nodes, mirror node, explorer, and relay in one command
* **Uses a values file** to configure all network components with custom settings
* **Simplifies deployment** by avoiding multiple manual steps
* **Provides quick teardown** with the destroy command
* **Ideal for testing and development** workflows

## Getting This Example

### Download Archive

> **Note for unzipped release archive:** If you run tasks from an unzipped release directory (outside the Solo git repository), set `USE_RELEASED_VERSION` before running `task`:
> `export USE_RELEASED_VERSION=true`

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-one-shot-falcon.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/one-shot-falcon).

## How to Use

1. **Install dependencies:**
   * Make sure you have [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [npm](https://www.npmjs.com/), [kubectl](https://kubernetes.io/docs/tasks/tools/), and [kind](https://kind.sigs.k8s.io/) installed.

2. **Customize your network:**
   * Edit `falcon-values.yaml` to configure network settings, node parameters, and component options.

3. **Deploy the network:**
   * From this directory, run:
     ```sh
     task deploy
     ```
   * This will:
     * Install the Solo CLI
     * Create a Kind cluster
     * Set the kubectl context
     * Deploy the complete network using `solo one-shot falcon deploy`

4. **Destroy the network:**
   * Run:
     ```sh
     task destroy
     ```
   * This will:
     * Destroy the Solo network using `solo one-shot falcon destroy`
     * Delete the Kind cluster

## Files

* `Taskfile.yml` — Automation tasks for deploy and destroy operations
* `falcon-values.yaml` — Configuration file with network and component settings

## Notes

* The **one-shot falcon** commands are designed to streamline deployment workflows
* All network components are configured through a single values file
* This is perfect for CI/CD pipelines and automated testing
* For more advanced customization, see the main [Solo documentation](https://github.com/hiero-ledger/solo)

## Configuration Sections

The `falcon-values.yaml` file contains the following configuration sections:

* `network` - Network-wide settings (release tag, application properties, etc.)
* `setup` - Node setup configuration (keys, admin settings, etc.)
* `consensusNode` - Consensus node start parameters
* `mirrorNode` - Mirror node deployment settings
* `explorerNode` - Explorer deployment settings
* `relayNode` - Relay deployment settings
* `blockNode` - Block node deployment settings (optional)

## Component Deployment Toggles

You can selectively disable deployment of optional components using command-line flags:

* `--deploy-mirror-node` - Deploy mirror node (default: true)
* `--deploy-explorer` - Deploy explorer (default: true)
* `--deploy-relay` - Deploy relay (default: true)

### Example: Deploy without Explorer and Relay

```sh
solo one-shot falcon deploy --values-file falcon-values.yaml --deploy-explorer=false --deploy-relay=false
```

This is useful for:

* Testing specific components in isolation
* Reducing resource usage during development
* Customizing deployment for specific testing scenarios
