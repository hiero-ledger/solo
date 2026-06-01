# Block-node back-pressure + upgrade: the "can't self-heal" case

Reproduces, on a Solo (kind) cluster, the scenario from
[hiero-consensus-node PR #25501](https://github.com/hiero-ledger/hiero-consensus-node/pull/25501)
and Tim's question: *"the scenario where CN0 can't self-heal."*

## What `reproduce.sh` does (7 phases)

1. Deploy 4 consensus + 4 block nodes (1:1), all `ACTIVE` at `config.version=0`.
2. Stall node1's block-node acks + load -> node1 saturates and leaves `ACTIVE` (back-pressure).
3. Try `consensus network upgrade` with node1 wedged -> aborts on `sdk ping ... :30212`. Solo's upgrade pings every node, so the real "one node misses the freeze" flow can't run.
4. Restore node1 to `ACTIVE`.
5. Manufacture the config-version split (bump the rest to `config.version=1`, node1 stays 0) -> fatal **ISS -> CATASTROPHIC_FAILURE**, no self-heal.
6. Realign versions + restart -> back to `ACTIVE`.

Phase 5 makes the split directly (kubectl + `-Dhedera.config.version`), not via a real freeze (phase 3 shows why that's impossible). It proves a config-version split is fatal and recovers only on operator realignment.

## Run

```bash
cd examples/block-node-backpressure-upgrade
./reproduce.sh            # full scenario (creates its own kind cluster)
./reproduce.sh teardown   # delete the cluster
```

Needs: `docker`, `kind`, `kubectl`, `node`/`npm`, `perl`. Runs 4 consensus + 4 real block nodes, so needs a machine with headroom. Set `USE_RELEASED_VERSION=true` to use `npx @hashgraph/solo`.
