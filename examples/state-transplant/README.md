# State Transplant Example

This example demonstrates starting a Solo network from a signed state that was captured on a **different**
network — the "network transplant" process.

## What it does

* Deploys a network (the source) and starts it
* Freezes the source network and downloads its signed state
* Deploys a second network (the target) with **its own separately generated keys**
* Starts the target network from the source network's state
* Verifies that the consensus node adopted the target network's roster

## Why the keys matter

A saved state embeds the address book of the network it came from: node IDs, gossip and service endpoints,
and public keys. Started naively from that state, the target network would try to be the source network — it
would gossip to endpoints that do not exist and present certificates that do not match its own private keys,
failing with `The signing certificate does not match the signing private key`.

Solo resolves this by writing `override-network.json` into `data/config`, where the consensus node looks for
it. The file describes the roster the target network is actually running with, and it is generated from the
live deployment rather than a snapshot, so it stays correct when nodes are added or updated.

Because this example generates the target network's keys independently, its roster genuinely differs from the
one in the state. The target reaching a healthy running state is therefore only possible if the override was
written, readable, and consumed — which is what makes the verification meaningful rather than vacuous.

## Prerequisites

* Docker or Podman
* `kind`, `kubectl`, `helm`
* Roughly 10-15 minutes and enough resources for two single-node networks

## Usage

Run the complete workflow:

```
task
```

Or step through it:

```
task create-cluster
task init-solo
task deploy-source
task save-state
task deploy-target
task transplant
task verify
```

`task` begins by running `task clean`, which removes the namespaces, deployments and saved state left by any
previous attempt, so the workflow can be re-run without manual tidying. To remove the cluster as well:

```
task destroy
```

## Which Solo build it runs

By default the example runs Solo **from source**, so it exercises your working tree. This matters: the
compiled output under `dist/` is only as current as your last build, and running a stale `dist/` silently
tests old behaviour while appearing to succeed.

* default — runs from source (`npm run solo-test`)
* `USE_BUILT_VERSION=true` — runs the compiled `dist/` (run `task build` at the repo root first)
* `USE_RELEASED_VERSION=true` — runs the published `@hashgraph/solo` package

## What `task verify` checks

`scripts/verify-override-network.sh` asserts, against the target network's pod:

1. the node logged `Parsed OVERRIDE network info` — the node itself confirming it read the file
2. no `AccessDeniedException` for the override — it must be owned by the `hedera` user the node runs as, not
   by root
3. the consumed roster names the target namespace and not the source one
4. the node is running with no signing-certificate mismatch

Assertion 1 is the load-bearing one. Note that the consensus node **moves** the file into
`data/config/.archive/<round>/override-network.json` once it has been consumed, so checking for the file at
`data/config/override-network.json` after a successful start would fail against a working system.

## Notes

* The source network must be frozen before its state is downloaded. A running node writes state files
  continuously and the archive cannot be zipped cleanly while that happens.
* `solo one-shot single destroy` removes the Kind cluster, and `solo consensus network destroy` removes the
  cluster-level charts, the remote config and the generated keys. This example avoids both and uses
  `task destroy` instead.
* The downloaded state is written under `$SOLO_HOME/logs/<namespace>/`, which is not always `~/.solo`.
