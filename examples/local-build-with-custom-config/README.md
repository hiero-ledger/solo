# Local Build with Custom Config Example

This example demonstrates how to create and manage a custom Hiero Hashgraph Solo deployment using locally built consensus nodes with custom configuration settings.

## What It Does
- **Uses local consensus node builds** from a specified build path for development and testing
- **Provides configurable Helm chart versions** for Block Node, Mirror Node, Explorer, and Relay components
- **Supports custom values files** for each component (Block Node, Mirror Node, Explorer, Relay)
- **Includes custom application.properties** and other configuration files
- **Automates the complete deployment workflow** with decision tree logic based on consensus node release tags
- **Defines a custom network topology** (number of nodes, namespaces, deployments, etc.)

## Configuration Options

### Consensus Node Configuration
- **Local Build Path**: `CN_LOCAL_BUILD_PATH` - Path to locally built consensus node artifacts
- **Release Tag**: `CN_VERSION` - Consensus node version for decision tree logic
- **Local Build Flag**: Automatically applied to use local builds instead of released versions

### Component Version Control
- **Block Node**: `BLOCK_NODE_RELEASE_TAG` - Helm chart version (e.g., "v0.63.9")
- **Mirror Node**: `MIRROR_NODE_VERSION_FLAG` - Version flag (e.g., "--mirror-node-version v0.136.1")
- **Relay**: `RELAY_RELEASE_FLAG` - Release flag (e.g., "--relay-release 0.70.1")
- **Explorer**: `EXPLORER_VERSION_FLAG` - Version flag (e.g., "--explorer-version 25.0.0")

### Custom Values Files
Each component can use custom Helm values files:
- **Block Node**: `block-node-values.yaml`
- **Mirror Node**: `mirror-node-values.yaml`
- **Relay**: `relay-node-values.yaml`
- **Explorer**: `hiero-explorer-node-values.yaml`

## How to Use
1. **Install dependencies:**
   - Make sure you have [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [npm](https://www.npmjs.com/), [kubectl](https://kubernetes.io/docs/tasks/tools/), and [kind](https://kind.sigs.k8s.io/) installed.

2. **Prepare local consensus node build:**
   - Build the consensus node locally or ensure the build path (`CN_LOCAL_BUILD_PATH`) points to valid artifacts
   - Default path: `../hiero-consensus-node/hedera-node/data`

3. **Customize your configuration:**
   - Edit `Taskfile.yml` to adjust network size, component versions, and paths
   - Modify values files (`*-values.yaml`) for component-specific customizations
   - Update `application.properties` for consensus node configuration

4. **Run the default workflow:**
   - From this directory, run:
     ```sh
     task
     ```
   - This will:
     - Install the Solo CLI
     - Create a Kind cluster
     - Set the kubectl context
     - Initialize Solo and configure cluster reference
     - Add block node with specified release tag
     - Generate consensus node keys
     - Deploy the network with local build and custom configuration
     - Set up and start consensus nodes using local builds
     - Deploy mirror node, relay, and explorer with custom versions and values

5. **Destroy the network:**
   - Run:
     ```sh
     task destroy
     ```
   - This will clean up all deployed components and delete the Kind cluster

## Files
- `Taskfile.yml` — All automation tasks and configuration
- `init-containers-values.yaml`, `settings.txt`, `log4j2.xml`, `application.properties` — Example config files for customizing your deployment

## Notes
- This example is **self-contained** and does not require files from outside this directory.
- All steps in the workflow are named for clear logging and troubleshooting.
- You can extend the Taskfile to add more custom resources or steps as needed.
- For more advanced usage, see the main [Solo documentation](https://github.com/hashgraph/solo).
