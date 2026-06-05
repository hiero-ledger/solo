# Block-node back-pressure + software upgrade

Reproduces, on a Solo (kind) cluster, the test scenario from
[hiero-consensus-node #25468](https://github.com/hiero-ledger/hiero-consensus-node/issues/25468)
(software upgrade while one consensus node is back-pressured) and the "can't self-heal"
question from [PR #25501](https://github.com/hiero-ledger/hiero-consensus-node/pull/25501).

## What `reproduce.sh` does (5 phases)

1. Deploy 4 consensus + 4 block nodes (1:1), all `ACTIVE` at `config.version=0`.
2. Stall node1's block-node acks + light load -> node1 leaves `ACTIVE` (back-pressure → `CHECKING`).
3. Upgrade: `dev-freeze freeze-upgrade --skip-node-alias node1`, then restart node2/3/4 at `config.version=1` from the freeze boundary -> they come up clean `ACTIVE`; node1 misses the freeze, stays at `0`.
4. Release node1's acks (block node acknowledges again, buffer drains).
5. Observe node1: it stays stuck on the old `config.version` and **cannot rejoin** the upgraded network. No self-heal — an operator must realign and restart.

Step 3 needs the Solo node-client tolerance patch (applied automatically in phase 1):
stock Solo aborts the upgrade the moment it can't reach the wedged node. The patch is
`solo-tolerant-nodeclient.patch`.

## Run

```bash
cd examples/block-node-backpressure-upgrade
./reproduce.sh            # faithful #25468 flow
./reproduce.sh recover    # operator recovery: realign versions + restart -> ACTIVE
./reproduce.sh teardown   # delete the cluster
```

Watch consensus logs (platform status, ISS) by tailing the node's log file:

```bash
kubectl --context kind-bn-backpressure -n namespace-bn-bp exec network-node1-0 \
  -c root-container -- tail -f /opt/hgcapp/services-hedera/HapiApp2.0/output/swirlds.log
```
