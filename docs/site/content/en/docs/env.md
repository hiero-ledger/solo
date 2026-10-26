# Environment Variables

## GENESIS\_KEY

* **Description:** ED25519 private key (DER hex) used as the genesis key of a new network. At `network deploy` Solo stores it in the `genesis-key` Kubernetes secret and sets `bootstrap.genesisPublicKey` on the consensus nodes to the matching public key. Later commands read the secret first, then this variable, then the default.
* **Default:** the well-known Solo genesis key.
* **Used in:** `src/core/constants.ts`, `src/core/genesis-key-resolver.ts`, `src/commands/network.ts`.

## SOLO\_BLOCK\_NODE\_CHART\_DIR

* **Description:** Local Helm chart directory for the block node chart, for testing a chart that has not been published.
* **Default:** unset (the published chart is used). The `--block-node-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/block-node.ts` (deploy, upgrade).

## SOLO\_EXPLORER\_CHART\_DIR

* **Description:** Local Helm chart directory for the explorer chart, for testing a chart that has not been published.
* **Default:** unset (the published chart is used). The `--explorer-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/explorer.ts` (deploy, upgrade).

## SOLO\_MIRROR\_NODE\_CHART\_DIR

* **Description:** Local Helm chart directory for the mirror node chart, for testing a chart that has not been published. Only the chart templates are local; every image the chart references must already be pullable by the cluster.
* **Default:** unset (the published chart is used). The `--mirror-node-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/mirror-node.ts` (deploy, upgrade).

## SOLO\_RELAY\_CHART\_DIR

* **Description:** Local Helm chart directory for the JSON-RPC relay chart, for testing a chart that has not been published.
* **Default:** unset (the published chart is used). The `--relay-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/relay.ts` (deploy, upgrade).
