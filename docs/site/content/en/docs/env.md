# Environment Variables

## GENESIS\_KEY

* **Description:** ED25519 private key (DER hex) used as the genesis key of a new network. At `network deploy` Solo stores it in the `genesis-key` Kubernetes secret and sets `bootstrap.genesisPublicKey` on the consensus nodes to the matching public key. Later commands read the secret first, then this variable, then the default.
* **Default:** the well-known Solo genesis key.
* **Used in:** `src/core/constants.ts`, `src/core/genesis-key-resolver.ts`, `src/commands/network.ts`.

## SOLO\_BLOCK\_NODE\_CHART\_DIR

* **Description:** Directory that contains the block node chart (`block-node-server`), for testing a chart that has not been published, e.g. `/path/to/hiero-block-node/charts`.
* **Default:** unset (the published chart is used). The `--block-node-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/block-node.ts` (deploy, upgrade).

## SOLO\_CACHE\_CDN\_BASE\_URL

* **Description:** Base URL that `solo cache image pull` downloads image archives and their `.sha256` hash files from, for a staging or test copy of the image cache CDN. Archives are fetched from `<base>/<file name>`; trailing slashes are ignored.
* **Default:** `https://cdn.solo.hiero.org`.
* **Used in:** `src/integration/cache/impl/cache-manifest-client.ts`.

## SOLO\_CACHE\_MANIFEST\_URL

* **Description:** Full URL of the image cache manifest (`cache-manifest.json`), for a manifest that is not published as a release asset (staging, testing).
* **Default:** unset (the manifest is downloaded from the GitHub release of the running Solo version, `https://github.com/hiero-ledger/solo/releases/download/v<version>/cache-manifest.json`).
* **Used in:** `src/integration/cache/impl/cache-manifest-client.ts`.

## SOLO\_EXPLORER\_CHART\_DIR

* **Description:** The explorer chart directory itself (the one holding `Chart.yaml`), for testing a chart that has not been published, e.g. `/path/to/hiero-mirror-node-explorer/_frontend/chart`.
* **Default:** unset (the published chart is used). The `--explorer-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/explorer.ts` (deploy, upgrade).

## SOLO\_MIRROR\_NODE\_CHART\_DIR

* **Description:** Directory that contains the mirror node chart (`hedera-mirror`), for testing a chart that has not been published, e.g. `/path/to/hiero-mirror-node/charts`. Only the chart templates are local; every image the chart references must already be pullable by the cluster.
* **Default:** unset (the published chart is used). The `--mirror-node-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/mirror-node.ts` (deploy, upgrade).

## SOLO\_RELAY\_CHART\_DIR

* **Description:** Directory that contains the JSON-RPC relay chart (`hedera-json-rpc`), for testing a chart that has not been published, e.g. `/path/to/hiero-json-rpc-relay/charts`.
* **Default:** unset (the published chart is used). The `--relay-chart-dir` flag takes precedence when provided.
* **Used in:** `src/commands/relay.ts` (deploy, upgrade).
