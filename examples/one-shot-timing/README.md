# One-Shot Single Deploy Timing Example

This example measures **cold start** and **warm start** deployment times for the Solo **one-shot single** command.

## What It Does

* **Cold start**: Deploys a complete Hiero network for the first time (no cached Docker images)
* **Destroy**: Tears down the deployment between measurements
* **Warm start**: Redeploys after destroy (Docker images are already cached locally, so faster)
* **Measures elapsed time** using the `time` command to report real, user, and sys durations
* **Optional local mirror node chart**: Set `USE_LOCAL_MIRROR_NODE_CHART=true` to check out the mirror node repository and deploy using its local Helm chart instead of the published version

## Why This Matters

The difference between cold and warm start times helps identify where time is spent:

* **Cold start** includes pulling Docker images, loading them into the cluster, and deploying all components
* **Warm start** skips image downloads (images are cached), showing the minimum deployment time when images are already available

## Getting This Example

### Download Archive

You can download this example as a standalone archive from the [Solo releases page](https://github.com/hiero-ledger/solo/releases):

```
https://github.com/hiero-ledger/solo/releases/download/<release_version>/example-one-shot-timing.zip
```

### View on GitHub

Browse the source code and configuration files for this example in the [GitHub repository](https://github.com/hiero-ledger/solo/tree/main/examples/one-shot-timing).

## Prerequisites

* [Task](https://taskfile.dev/) - Task runner
* [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/)
* [kubectl](https://kubernetes.io/docs/tasks/tools/)
* [kind](https://kind.sigs.k8s.io/) — Kubernetes in Docker
* [Helm](https://helm.sh/) — required only when `USE_LOCAL_MIRROR_NODE_CHART=true`
* Git — required only when `USE_LOCAL_MIRROR_NODE_CHART=true` to clone the mirror node repo

## How to Use

### Quick Start (Full Timing Test)

Run both cold and warm start measurements in one command from this directory:

```sh
task
```

This will:
1. Measure **cold start** time: `time solo one-shot single deploy`
2. Destroy the deployment: `solo one-shot single destroy`
3. Measure **warm start** time: `time solo one-shot single deploy`
4. Destroy the deployment (cleanup): `solo one-shot single destroy`

### Using a Local Mirror Node Chart

Set `USE_LOCAL_MIRROR_NODE_CHART=true` to check out the `hiero-mirror-node` repository at the
version defined in `version.ts` and use its local Helm chart for the mirror node deployment:

```sh
USE_LOCAL_MIRROR_NODE_CHART=true task
```

When enabled, the Taskfile will automatically:
1. Clone `hiero-mirror-node` next to the `solo` repo (e.g., `../hiero-mirror-node`) if not already present
2. Run `helm dependency build` for the local mirror node chart
3. Generate a runtime values file at `/tmp/one-shot-timing-runtime-values.yaml` with `--mirror-node-chart-dir` set
4. Pass `--values-file /tmp/one-shot-timing-runtime-values.yaml` to `solo one-shot single deploy`

### Individual Tasks

You can also run individual steps:

```sh
# Step 1: Measure cold start time
task cold-start

# Step 2: Destroy the deployment
task destroy

# Step 3: Measure warm start time
task warm-start

# Step 4: Cleanup
task destroy
```

When using a local mirror node chart, you can also prepare the setup separately:

```sh
# Checkout and prepare the mirror node chart (only needed once)
USE_LOCAL_MIRROR_NODE_CHART=true task setup-local-mirror-node

# Then run the timing test
USE_LOCAL_MIRROR_NODE_CHART=true task test
```

## Understanding the Output

After each `time $SOLO_COMMAND one-shot single deploy` call, you will see output like:

```
real    12m34.567s
user    1m23.456s
sys     0m12.345s
```

* **real**: Total wall clock time — this is the deployment duration from the user's perspective
* **user**: CPU time spent in user mode
* **sys**: CPU time spent in kernel mode

Compare the **real** time between cold and warm start to understand the impact of Docker image caching.

## Files

* `Taskfile.yml` — Automation tasks for measuring cold and warm start times

## Configuration

| Variable | Default | Description |
|---|---|---|
| `USE_LOCAL_MIRROR_NODE_CHART` | `false` | When `true`, checks out the mirror node repo and uses its local Helm chart via `--mirror-node-chart-dir` |
| `USE_RELEASED_VERSION` | `false` | When `true`, installs and uses the latest released Solo CLI via `npx @hashgraph/solo` |

## Notes

* The `ONE_SHOT_WITH_BLOCK_NODE=true` environment variable includes the block node in the deployment
* The **one-shot single** command creates a uniquely named deployment automatically
* When `USE_LOCAL_MIRROR_NODE_CHART=true`, the mirror node repo is cloned next to the `solo` repo at `../hiero-mirror-node`; if it already exists the clone step is skipped
* For more advanced customization with a values file, see the [one-shot-falcon example](../one-shot-falcon)
* For a full local-build example using all components, see the [one-shot-local-build example](../one-shot-local-build)
* For more advanced customization, see the main [Solo documentation](https://github.com/hiero-ledger/solo)
