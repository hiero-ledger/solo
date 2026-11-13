# Multi-Cluster No-Consensus-Cluster Example

Deploys a multi-cluster deployment where only cluster 1 runs a consensus node and cluster 2 is attached
with **zero** consensus nodes, hosting only a block node and a mirror node
(see [issue #3310](https://github.com/hiero-ledger/solo/issues/3310)).

## What It Does

- Creates two Kind clusters (with MetalLB)
- Attaches cluster 1 with one consensus node and cluster 2 with `--num-consensus-nodes 0`
- Adds a block node and a mirror node to **each** cluster. `block-node-1` is `node1`'s primary
  (`priority 1`); `block-node-2` in cluster 2 is `node1`'s secondary (`priority 2`). Both mirror nodes
  import the block stream from the block node in their own cluster
- Exposes each block node through a static MetalLB address and points each cluster's CoreDNS at the
  other cluster's block node (`link-clusters` task), so pods in one cluster can reach a block node in
  the other
- Verifies that cluster 2 is in the remote config with no consensus node pods, that every component pod is
  Ready, that `node1` can open a connection to `block-node-2`, and that a newly created account shows up
  in the mirror node REST API of **both** clusters (consensus node → block node → mirror node)

## Prerequisites

- [Task](https://taskfile.dev/), [Node.js](https://nodejs.org/), [kubectl](https://kubernetes.io/docs/tasks/tools/),
  [kind](https://kind.sigs.k8s.io/), [Helm](https://helm.sh/), Docker

## How to Use

```sh
task            # deploy and verify
task destroy    # clean up
```

## Files

- `Taskfile.yml` — deploy, verify and destroy tasks
- `kind-cluster-*.yaml`, `metallb-cluster-*.yaml` — the same two-cluster Kind and MetalLB setup used by
  `multicluster-component-image`
- `mirror-memory-values.yaml` — memory limits above Solo's defaults for this deployment only

## Notes

- The deploy fails at `deployment cluster attach` for cluster 2 on Solo versions that do not support zero
  consensus nodes (issue #3310).
- Solo writes block nodes into `block-nodes.json` by their service FQDN
  (`block-node-<id>.<namespace>.svc.<dns base domain>`) but does not make that name resolvable from another
  cluster. This example does it with a CoreDNS `hosts` entry pointing at the block node's LoadBalancer IP.
- The mirror node of cluster 2 reads from `block-node-2`, so it only receives data if `block-node-2` is fed,
  either by `node1` (secondary) or by backfilling from `block-node-1`.

## Limitation

The cluster without consensus nodes has no storage credentials, so Solo creates an empty `uploader-mirror-secrets`
for its mirror node importer. Use `--mirror-node-source block-node` there, as this example does. Reading record
streams from a cloud bucket in such a cluster is not supported.
