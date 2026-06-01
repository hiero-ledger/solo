# Block-Node Back-Pressure + Software-Upgrade Example

Reproduces the scenario from [hiero-consensus-node PR #25501](https://github.com/hiero-ledger/hiero-consensus-node/pull/25501)
on a real Kubernetes (Kind) cluster using Solo, and adds **explicit port-stability
assertions** across the upgrade.

## Why this exists

PR #25501 covers the case where one consensus node is stuck in `CHECKING` because
its block node withholds acknowledgements (back-pressure), then a software upgrade
restarts the other three nodes at the next config version. The HAPI test-client
exhibited **strange behavior in how it assigns new ports to nodes during an
upgrade**. This example runs the same shape against Solo — where addressing is
managed by Kubernetes services — so the port behavior can be observed
independently of the test-client's port-assignment logic.

## Scenario shape

- **4 consensus nodes** (`node1`–`node4`), each pinned **1:1** to its own
  **block node** via `block node add --priority-mapping nodeX=2`.
- A tiny block buffer (`blockStream.buffer.maxBlocks=5`, `streamMode=BLOCKS`,
  `writerMode=GRPC`) applied network-wide via
  [`resources/application.properties`](./resources/application.properties).
- `node1` is the victim: its block node (BN0) is killed, so only `node1`
  saturates and trips back-pressure.

## Stage → PR mapping

The single `task` runs these steps in sequence:

| Step | PR #25501 step |
|------|----------------|
| 1. cluster + solo init | Kind cluster + Solo init/connect/deployment |
| 2. deploy | 4 CN + 4 BN pinned 1:1, small buffer (`@HapiBlockNode` + `applicationPropertiesOverrides`) |
| 3. baseline ports | capture addressing before disruption |
| 4. induce back-pressure | `blockNode(0).shutDownImmediately()` + load ⇒ `"Block buffer is saturated; backpressure is being enabled"`, node enters `CHECKING` |
| 5. upgrade healthy nodes | `freezeUpgrade()` + restart node2–4 at next config version, leaving node1 stuck (`exceptNodeIds(0)`) |
| 6. restore block node | `blockNode(0).startImmediately()` ⇒ `"back pressure will be disabled"` + `"BlockAcknowledgement received for block"` (no buffered-data loss) |
| 7. port check | **port-reassignment check** (Solo-specific, the reason for this example) |
| 8. recover node1 | restart node1 onto new config version ⇒ `ACTIVE` or `CATASTROPHIC_FAILURE` |

## Prerequisites

- Kind + Docker (cluster must have headroom for **4 consensus nodes + 4 REAL
  block nodes** — this is resource-heavy)
- Node.js + npm, Task runner (`npm install -g @go-task/cli`)
- A local consensus-node checkout for version extraction (this repo's
  `version.ts` / `version-test.ts` supply the deploy/upgrade versions)

## Usage

One command runs the whole suite:

```bash
cd examples/block-node-backpressure-upgrade
task
```

It stands up the cluster, deploys 4 CN + 4 BN, drives the back-pressure →
partial-upgrade → restore → recovery flow, prints the **PORTS STABLE / PORTS
CHANGED** verdict, and reports node1's final status. Tear down afterward with:

```bash
kind delete cluster -n bn-backpressure-cluster
```

Note: the upgrade step upgrades only `node2,node3,node4`, leaving the wedged
`node1` behind — mirroring the PR's `exceptNodeIds(0)`. A whole-network upgrade
would stall because `node1` never reaches `FREEZE_COMPLETE` while
back-pressured.

## The port check

`scripts/capture-ports.sh` snapshots two things per `baseline` / `post-upgrade`:

1. **Kubernetes service ports** for every `network-node*` / `block-node*`
   service (incl. `nodePort`) — a defensible proxy, and a STABLE verdict here is
   a meaningful control isolating any weirdness to the test-client.
2. **Consensus gossip/service endpoints** pulled best-effort from each node's
   address book (`genesis-network.json`; modern nodes have no `config.txt`) —
   the authoritative node→port map from consensus's own view, which is what the
   test-client was reassigning on upgrade. This is the truer signal; Service
   ports may be ClusterIP-only and never surface as nodePorts.

`scripts/diff-ports.sh` compares the `baseline` and `post-upgrade` snapshots:

- **PORTS STABLE** → addressing survived the upgrade (expected, healthy).
- **PORTS CHANGED** → addressing was reassigned — this is the behavior to
  investigate, and reproduces what was seen in the test-client.

Snapshots are written to `/tmp/bn-bp-ports-<label>.txt`. If the gossip-endpoint
section shows "genesis-network.json not found", confirm the path inside the pod
and update `GENESIS` in `scripts/capture-ports.sh`.

## What was verified live vs. left to the full run

Validated on a kind cluster (2 CN + 2 BN, solo v0.73):

- 4 (here 2) sequential `block node add` calls create independent block nodes
  (`block-node-1`, `block-node-2`) as **StatefulSets**; `--priority-mapping`
  pins each 1:1 (node1→block-node-1, node2→block-node-2, confirmed in each
  node's `block-nodes.json`).
- `--application-properties` applies the overrides network-wide (verified
  `blockStream.buffer.maxBlocks=5` in the running node).
- The saturation log line `"Block buffer is saturated; backpressure is being
  enabled"` appears (it even fired naturally with `maxBlocks=5`).
- All four helper scripts run green against a live cluster: `capture-ports.sh`
  (Service ports + gossip endpoints), `diff-ports.sh` (STABLE and CHANGED),
  `wait-for-log.sh` (on-disk file grep), and the `recover-cn0` status detection.

Not exercised (needs the full down→up cycle on a 4+4 network): the actual
back-pressure→`CHECKING` timing, the BN restart recovery, and the
`"...back pressure will be disabled"` / `"BlockAcknowledgement received for
block"` lines (both **confirmed present in the consensus-node source**, just not
triggered in the partial run).

## Known limitations / things to verify in your cluster

1. **Kind node image is pinned.** The task creates the cluster with
   `--image kindest/node:v1.31.4`; kind 0.31's default (v1.35.0) fails to boot
   the kubelet on current Docker ("required cgroups disabled"). Adjust
   `KIND_IMAGE` in `Taskfile.yml` if your kind/Docker combo needs a different
   image.
2. **kubectl context is explicit.** Solo commands switch the current kube
   context mid-run (observed: it jumped to an unrelated cluster), so every
   `kubectl` call passes `--context {{ .CONTEXT }}` and the scripts take a
   context argument. Don't drop it.
3. **Block-node workload is a StatefulSet** (`block-node-1`). The scale steps
   target `statefulset` first with a `deployment` fallback for other chart
   layouts.
4. **Buffer override is network-wide.** Solo applies one `application.properties`
   to all nodes (no per-node override like the HAPI
   `applicationPropertiesOverrides`). Harmless here because only BN0 is killed,
   so only `node1` saturates.
5. **Log-based assertions read on-disk files.** Consensus nodes write the
   interesting lines to files under
   `/opt/hgcapp/services-hedera/HapiApp2.0/output` (`block-node-comms.log`,
   `swirlds.log`), **not** pod stdout — `wait-for-log.sh` greps those files via
   `exec`. **Log strings are consensus-node-version specific**; if a wait times
   out, confirm the wording in the running node's logs.
6. **`recover-cn0` is observational.** Like the PR, it accepts either `ACTIVE`
   or `CATASTROPHIC_FAILURE`. Full recovery would need a state-sync/reconnect
   path that wipes node1's local state before restart.
7. **`npm run solo` needs a built repo.** The dev invocation runs
   `dist/solo.js`; build the solo repo first (or set `USE_RELEASED_VERSION=true`
   to use `npx @hashgraph/solo`).

## Cleanup

```bash
kind delete cluster -n bn-backpressure-cluster
```
