# Block-node back-pressure + upgrade: the "can't self-heal" case

Reproduces, on a Solo (kind) cluster, the scenario from
[hiero-consensus-node PR #25501](https://github.com/hiero-ledger/hiero-consensus-node/pull/25501)
and Tim's question: *"the scenario where CN0 can't self-heal."*

## What `reproduce.sh` does (6 phases, stops at the failure)

1. Deploy 4 consensus + 4 block nodes (1:1), all `ACTIVE` at `config.version=0`.
2. Stall node1's block-node acks + light load -> node1 saturates and leaves `ACTIVE` (back-pressure).
3. Try `consensus network upgrade` while node1 is wedged -> it can't complete (Solo's upgrade pings every node), so the real "one node misses the freeze" flow can't run through Solo.
4. Restore node1 to `ACTIVE`.
5. Manufacture the config-version split (bump the rest to `config.version=1`, node1 stays 0) -> fatal **ISS -> CATASTROPHIC_FAILURE**.
6. Stop. The network stays in `CATASTROPHIC_FAILURE` -- it does not self-heal.

The split is made directly (kubectl + `-Dhedera.config.version`), not via a real freeze (the upgrade step shows why that's impossible). It proves a config-version split is fatal and recovers only on operator action.

## Run

```bash
cd examples/block-node-backpressure-upgrade
./reproduce.sh            # run the scenario; stops at CATASTROPHIC_FAILURE
./reproduce.sh recover    # operator recovery: realign versions + restart -> ACTIVE
./reproduce.sh teardown   # delete the cluster
```

To watch consensus logs (platform status, ISS), tail the node's log file:

```bash
kubectl --context kind-bn-backpressure -n namespace-bn-bp exec network-node1-0 \
  -c root-container -- tail -f /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log
```
