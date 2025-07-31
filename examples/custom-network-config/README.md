# Custom Network Config Example

This example demonstrates how to create and manage a custom Hiero Hashgraph Solo deployment and configure it with custom settings.

## What It Does
- **Defines a custom network topology** (number of nodes, namespaces, deployments, etc.)
- **Provides a Taskfile** for automating cluster creation, deployment, key management, and network operations
- **Supports local development and testing** of Hedera network features
- **Can be extended** to include mirror nodes, explorers, and relays

## How to Use
1. **Install dependencies:**
   - Make sure you have [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [npm](https://www.npmjs.com/), [kubectl](https://kubernetes.io/docs/tasks/tools/), and [kind](https://kind.sigs.k8s.io/) installed.
2. **Customize your network:**
   - Edit `Taskfile.yml` to set the desired network size, namespaces, and other parameters. 
3. **Run the default workflow:**
   - From this directory, run:
     ```sh
     task
     ```
   - This will initialize the environment, install dependencies, create a kind cluster, and deploy the custom network.
4. **Other useful commands:**
   - `task destroy` — Tear down the network
   - `task clean` — Remove all generated files and resources
   - `task show:ips` — Show external IPs of the nodes

## Files
- `Taskfile.yml` — All automation tasks and configuration
- `init-containers-values.yaml`, `settings.txt`, etc. — Example config files for customizing your deployment (add as needed)

## Notes
- This example is **self-contained** and does not require files from outside this directory.
- You can extend the Taskfile to add mirror nodes, explorers, relays, or other custom resources.
- For more advanced usage, see the main [Solo documentation](https://github.com/hashgraph/solo).

