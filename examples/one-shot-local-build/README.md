# One-Shot Local Build Example

This example demonstrates how to deploy a complete Hiero Ledger network using locally built
and locally cloned component sources via the Solo **one-shot falcon** command. It is designed to
help developers recreate the one-shot single deploy performance test with their own local builds.

## What It Does

* **Checks out all component repositories** at the versions defined in `version.ts`
* **Builds the consensus node from source** using Gradle (requires Java 21)
* **Uses local chart directories** for block node, mirror node, relay, and explorer
* **Uses a local consensus node build** via the `--local-build-path` flag
* **Deploys the full stack** with a single `task` command via `solo one-shot falcon deploy`

## Component Repositories Used

| Component         | Repository                                                                         | Flag                    |
|-------------------|------------------------------------------------------------------------------------|-------------------------|
| Consensus Node    | [hiero-consensus-node](https://github.com/hiero-ledger/hiero-consensus-node)       | `--local-build-path`    |
| Block Node        | [hiero-block-node](https://github.com/hiero-ledger/hiero-block-node)               | `--block-node-chart-dir`|
| Mirror Node       | [hiero-mirror-node](https://github.com/hiero-ledger/hiero-mirror-node)             | `--mirror-node-chart-dir`|
| Relay (JSON-RPC)  | [hiero-json-rpc-relay](https://github.com/hiero-ledger/hiero-json-rpc-relay)       | `--relay-chart-dir`     |
| Explorer          | [hiero-mirror-node-explorer](https://github.com/hiero-ledger/hiero-mirror-node-explorer) | `--explorer-chart-dir` |

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases).
Replace `<release_version>` with the desired release tag (e.g., `v0.62.0`):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-one-shot-local-build.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/one-shot-local-build).

## Prerequisites

* [Task](https://taskfile.dev/) - Task runner
* [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/)
* [kubectl](https://kubernetes.io/docs/tasks/tools/)
* [kind](https://kind.sigs.k8s.io/) — Kubernetes in Docker
* [Java 25](https://adoptium.net/) — required to build the consensus node
* [Gradle](https://gradle.org/) — used by the consensus node build (wrapper included in repo)
* Git — to clone the component repositories

## How to Use

### Quick Start (Automated)

Run everything in one command from this directory:

```sh
task
```

This will:

1. Clone all component repositories next to the `solo` directory (e.g., `../hiero-consensus-node`)
2. Run `helm dependency build` for each local chart directory
3. Build the consensus node from source with Gradle
4. Generate a runtime values YAML with actual local paths
5. Create a local Kind cluster
6. Deploy the full network stack using `solo one-shot falcon deploy`

### Step-by-Step Workflow

You can also run the steps individually:

```sh
# 1. Checkout all component repos at the correct versions
task checkout-repos

# 2. Build Helm chart dependencies for all local chart directories
task build-chart-deps

# 3. Build the consensus node (requires Java 25 and Gradle)
task build-consensus-node

# 4. Generate the runtime values YAML with actual paths
task generate-values

# 5. Deploy the full network with local builds
task deploy
```

### Using Your Own Pre-Cloned Repositories

If you already have the repositories checked out locally, the Taskfile will skip the clone step.
The default expected locations (relative to the `solo` project parent directory) are:

```
../hiero-consensus-node    — consensus node repo
../hiero-block-node        — block node repo
../hiero-mirror-node       — mirror node repo
../hiero-json-rpc-relay    — relay repo
../hiero-mirror-node-explorer — explorer repo
```

You can override these by editing the `vars:` section in `Taskfile.yml`.

### Manual Values File

You can also customize `local-build-values.yaml` directly with your own paths and pass it
to the solo command manually:

```sh
solo one-shot falcon deploy --values-file local-build-values.yaml
```

### Destroying the Network

```sh
task destroy
```

This will:

1. Destroy the Solo one-shot deployment
2. Delete the Kind cluster
3. Remove the generated runtime values file

## Files

* `Taskfile.yml` — Automation tasks for checkout, build, generate, deploy, and destroy
* `local-build-values.yaml` — Template values file documenting available local build flags

## How the Values File Works

The `local-build-values.yaml` file (and the generated runtime version) configures the
`solo one-shot falcon deploy` command with local build paths. Each section maps to a component:

```yaml
# Tell Solo to use a locally built consensus node instead of a published release
setup:
  --local-build-path: "/path/to/hiero-consensus-node/hedera-node/data"

# Use local Helm chart directories instead of published chart versions
blockNode:
  --block-node-chart-dir: "/path/to/hiero-block-node/charts"

mirrorNode:
  --mirror-node-chart-dir: "/path/to/hiero-mirror-node/charts"

relayNode:
  --relay-chart-dir: "/path/to/hiero-json-rpc-relay/charts"

explorerNode:
  --explorer-chart-dir: "/path/to/hiero-mirror-node-explorer/charts"
```

## Customization

* **Change the number of consensus nodes**: Modify `--num-consensus-nodes` in the deploy task
* **Use custom cluster name**: Edit the `CLUSTER_NAME` variable in `Taskfile.yml`
* **Override component paths**: Edit the `*_REPO_DIR` variables in the `vars:` section
* **Add extra configuration**: Extend the values file with additional flags for each component
  (see `examples/one-shot-falcon/falcon-values.yaml` for all available options)

## Notes

* The Taskfile sets `ONE_SHOT_WITH_BLOCK_NODE=true` to include the block node in the deployment
* Repository clones are shallow (`--depth 1`) for faster checkout
* If a repository directory already exists, the clone step is skipped
* If the consensus node build output already exists, the build step is skipped
* For more advanced customization, see the main [Solo documentation](https://github.com/hiero-ledger/solo)
