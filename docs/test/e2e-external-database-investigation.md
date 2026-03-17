# E2E External Database Test — Investigation Summary

## Problem

The E2E external database test (`test-e2e-external-database`) fails at the `helm test` step (mirror node acceptance test) with a 20-minute timeout, while the equivalent Taskfile-based example passes in CI.

The helm test runs a bats container that polls the mirror node REST API endpoints:
- `GET /api/v1/accounts?limit=1`
- `GET /api/v1/transactions?limit=1`

Both must return non-empty results within 20 minutes. The test times out because the mirror node never ingests any data.

## Test Topology

The E2E dual-cluster setup deploys:

| Component | Cluster |
|-----------|---------|
| Consensus node 0 | cluster 1 |
| Consensus node 1 | cluster 2 |
| Mirror node (importer, REST, monitor) | cluster 2 |
| MinIO (stream file uploader) | cluster 1 |
| External PostgreSQL database | cluster 2 |

## Root Causes Identified

### Root Cause A (Primary): Cross-Cluster MinIO Isolation

The mirror node importer in **cluster 2** cannot reach MinIO in **cluster 1** because the uploader secret uses a cluster-local DNS name:

```
http://minio-server-hl:9000
```

This hostname resolves only within cluster 1. The importer in cluster 2 fails to download any stream files, so accounts and transactions never appear in the REST API.

**Relevant files:**
- `solo-charts/charts/solo-deployment/templates/secrets/uploader-mirror-secrets.yaml` — contains the cluster-local MinIO URL
- `solo-charts/charts/solo-deployment/templates/mirror-node-values.yaml` — importer envFrom references `uploader-mirror-secrets`

**Impact:** Complete data pipeline failure — no record streams are ingested.

### Root Cause B: Entity ID Encoding Mismatch in Database Seeding

When `shard ≠ 0` or `realm ≠ 0`, the mirror node uses an encoded `entity_id` format:

```
entity_id = (shard << 54) | (realm << 38) | num
```

The database seeding SQL in `src/commands/mirror-node.ts` was inserting raw entity numbers (e.g., `111`, `112`) as `entity_id` values instead of the encoded form. For a deployment with `shard=3, realm=2`, the correct encoding for file `111` would be:

```
(3 << 54) | (2 << 38) | 111 = 54,325,952,659,816,559
```

**Fix applied:** Added `encodeEntityId()` static method to `MirrorNodeCommand` in `src/commands/mirror-node.ts` that correctly encodes entity IDs using BigInt arithmetic when shard/realm are non-zero. Updated the `INSERT` statements for `t_entities` to use encoded values.

**Relevant files:**
- `src/commands/mirror-node.ts` — seeding queries and new `encodeEntityId()` method
- `hiero-mirror-node/common/src/main/java/org/hiero/mirror/common/domain/entity/EntityId.java` — reference encoding implementation

### Root Cause C: Monitor Cross-Cluster Node Discovery

The mirror monitor (pinger) discovers consensus nodes via the REST API address book. In a multi-cluster deployment, the monitor in cluster 2 may not be able to reach consensus nodes in cluster 1 via internal addresses, reducing or eliminating its ability to submit transactions.

Additionally, `ConsensusValidatorImpl` requires signatures from nodes holding > 1/3 of total stake weight. If the monitor can only reach nodes in one cluster, consensus validation of downloaded files may also fail.

**Relevant files:**
- `hiero-mirror-node/monitor/src/main/java/org/hiero/mirror/monitor/publish/NodeSupplier.java` — node discovery
- `hiero-mirror-node/importer/src/main/java/org/hiero/mirror/importer/downloader/ConsensusValidatorImpl.java` — 1/3 stake consensus validation

## Why the Taskfile Example Passes

The Taskfile-based external database example runs all components in a **single cluster**, so:
- MinIO is reachable via cluster-local DNS
- Entity IDs use default `shard=0, realm=0` (encoding is a no-op)
- Monitor can reach all consensus nodes directly

## Fix Status

| Root Cause | Status | Notes |
|------------|--------|-------|
| A — Cross-cluster MinIO | **Not fixed** | Primary blocker; requires cross-cluster accessible MinIO endpoint or multi-source downloader config |
| B — Entity ID encoding | **Fixed** | `encodeEntityId()` added to `MirrorNodeCommand`; build passes |
| C — Monitor connectivity | **Not fixed** | May need cross-cluster networking or per-cluster monitor instances |

## Recommendations

1. **Fix Root Cause A first** — without stream file access, no data flows through the pipeline regardless of other fixes. Options:
   - Expose MinIO via a NodePort or LoadBalancer service accessible across clusters
   - Use a shared object storage endpoint (e.g., cloud S3) instead of cluster-local MinIO
   - Configure the importer with multiple downloader sources covering both clusters

2. **Validate entity ID fix** — re-run the E2E test after fixing cross-cluster MinIO to confirm the seeding queries produce correct results for non-zero shard/realm deployments.

3. **Address monitor connectivity** — consider deploying per-cluster monitor instances or configuring cross-cluster network policies to allow the monitor to reach all consensus nodes.
