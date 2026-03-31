# Plan: Move TSS/WRAPS Constants to `tss-config.yaml`

## Context

TSS (Threshold Signature Scheme) and WRAPS (zero-knowledge proof library) configuration values are
currently hardcoded as exported constants in `src/core/constants.ts`. Each constant reads from a
non-prefixed environment variable (e.g., `TSS_READY_MAX_ATTEMPTS`) with an in-code default. This
approach bypasses the layered `ConfigProvider` system already used for Helm chart configuration.

The goal is to move these values into `resources/config/tss-config.yaml`, registered as a second
`DefaultConfigSource` alongside the existing (renamed) `HelmChartConfigSource`. Both sources,
together with `EnvironmentConfigSource`, are merged into a single unified `SoloConfigSchema`. The
TSS fields live under a new `tss: TssSchema` field on that schema. No new `InjectToken` is
introduced — commands that need TSS values inject the existing `InjectTokens.ConfigProvider` and
read from the merged config.

Splitting the YAML into two files (`helm-chart-config.yaml` and `tss-config.yaml`) is purely for
maintainability — each domain stays in its own file without the schema knowing about the split.

**Breaking change for env var users:** Current constants accept unprefixed env vars
(e.g., `TSS_READY_MAX_ATTEMPTS`). After migration, `EnvironmentConfigSource` uses the `SOLO_`
prefix, so overrides require e.g. `SOLO_TSS_READY_MAX_ATTEMPTS`. The download URL env var is also
renamed: `WRAPS_ARTIFACT_LIB_DOWNLOAD_URL` → `SOLO_TSS_WRAPS_LIB_DOWNLOAD_URL` (following the
`SOLO_TSS_*` key path). Update `docs/site/content/en/docs/env.md` accordingly.

---

## Constants to Migrate

All from `src/core/constants.ts` lines 409–482. These become fields under `tss:` in
`tss-config.yaml` and properties of `TssSchema`:

| Constant | YAML key (under `tss:`) | Old env var | New env var |
|---|---|---|---|
| `MESSAGE_SIZE_SOFT_LIMIT_BYTES_TSS` | `messageSizeSoftLimitBytes` | `MESSAGE_SIZE_SOFT_LIMIT_BYTES_TSS` | `SOLO_TSS_MESSAGE_SIZE_SOFT_LIMIT_BYTES` |
| `MESSAGE_SIZE_HARD_LIMIT_BYTES_TSS` | `messageSizeHardLimitBytes` | `MESSAGE_SIZE_HARD_LIMIT_BYTES_TSS` | `SOLO_TSS_MESSAGE_SIZE_HARD_LIMIT_BYTES` |
| `TIMEOUT_AFTER_TSS_IS_READY_IN_SECONDS` | `timeoutAfterReadySeconds` | `TIMEOUT_AFTER_TSS_IS_READY_IN_SECONDS` | `SOLO_TSS_TIMEOUT_AFTER_READY_SECONDS` |
| `TSS_READY_MAX_ATTEMPTS` | `readyMaxAttempts` | `TSS_READY_MAX_ATTEMPTS` | `SOLO_TSS_READY_MAX_ATTEMPTS` |
| `TSS_READY_BACKOFF_SECONDS` | `readyBackoffSeconds` | `TSS_READY_BACKOFF_SECONDS` | `SOLO_TSS_READY_BACKOFF_SECONDS` |
| `TSS_LIB_WRAPS_ARTIFACTS_FOLDER_NAME` | `wraps.artifactsFolderName` | `TSS_LIB_WRAPS_ARTIFACTS_FOLDER_NAME` | `SOLO_TSS_WRAPS_ARTIFACTS_FOLDER_NAME` |
| `WRAPS_DIRECTORY_NAME` | `wraps.directoryName` | `WRAPS_DIRECTORY_NAME` | `SOLO_TSS_WRAPS_DIRECTORY_NAME` |
| `WRAPS_ALLOWED_KEY_FILES` | `wraps.allowedKeyFiles` | `WRAPS_ALLOWED_KEY_FILES` | `SOLO_TSS_WRAPS_ALLOWED_KEY_FILES` |
| `WRAPS_LIB_DOWNLOAD_URL` | `wraps.libDownloadUrl` | `WRAPS_ARTIFACT_LIB_DOWNLOAD_URL` | `SOLO_TSS_WRAPS_LIB_DOWNLOAD_URL` |

`BLOCK_NODE_TSS_VALUES_FILE` is a file-path constant pointing to a Helm values override file —
leave it in `constants.ts`.

**Note on `wraps.libDownloadUrl`:** Currently computed from `WRAPS_DIRECTORY_NAME` at module load
time. In the YAML both are stored independently. A YAML comment documents the dependency; no
runtime interpolation.

---

## Implementation Steps

Execute in this order to avoid compile errors at each stage.

### Step 1 — Refactor `DefaultConfigSource` to Accept a Name

**File:** `src/data/configuration/impl/default-config-source.ts`

Add a fifth constructor parameter `sourceName: string = 'DefaultConfigSource'`, store as a private
field, return from the `name` getter. The existing call site in `container-init.ts` passes no fifth
argument and retains the current behavior — pure backward-compatible expansion.

### Step 2 — Create `TssSchema` Model

**New file:** `src/data/schema/model/solo/tss-schema.ts`

A simple `@Exclude()`/`@Expose()` class (no SchemaDefinition, no migration of its own):

```typescript
@Exclude()
export class WrapsSchema {
  @Expose() public artifactsFolderName: string | undefined;
  @Expose() public directoryName: string | undefined;
  @Expose() public allowedKeyFiles: string | undefined;
  // IMPORTANT: libDownloadUrl must be kept consistent with directoryName.
  // If directoryName is updated, update libDownloadUrl to match.
  @Expose() public libDownloadUrl: string | undefined;
}

@Exclude()
export class TssSchema {
  @Expose() public messageSizeSoftLimitBytes: number | undefined;
  @Expose() public messageSizeHardLimitBytes: number | undefined;
  @Expose() public timeoutAfterReadySeconds: number | undefined;
  @Expose() public readyMaxAttempts: number | undefined;
  @Expose() public readyBackoffSeconds: number | undefined;
  @Expose() public wraps: WrapsSchema | undefined;
}
```

### Step 3 — Add `tss` Field to `SoloConfigSchema`

**File:** `src/data/schema/model/solo/solo-config-schema.ts`

Add the import and field:
```typescript
import {type TssSchema} from './tss-schema.js';

// inside the class:
@Expose()
public tss: TssSchema | undefined;
```

Update the constructor signature and body to include `tss?: TssSchema`.

### Step 4 — Update `SoloConfigV1Migration`

**File:** `src/data/schema/migration/impl/solo/solo-config-v1-migration.ts`

In `migrate()`, after setting the existing helm chart fields, add:
```typescript
if (!clone.tss) {
  clone.tss = this.getNewTssObject();
}
```

Add a private helper `getNewTssObject()` that returns the defaults:
```typescript
private getNewTssObject(): object {
  return {
    messageSizeSoftLimitBytes: 4_194_304,
    messageSizeHardLimitBytes: 37_748_736,
    timeoutAfterReadySeconds: 10,
    readyMaxAttempts: 60,
    readyBackoffSeconds: 3,
    wraps: {
      artifactsFolderName: 'wraps-v0.2.0',
      directoryName: 'wraps-v0.2.0',
      allowedKeyFiles: 'decider_pp.bin,decider_vp.bin,nova_pp.bin,nova_vp.bin',
      libDownloadUrl: 'https://builds.hedera.com/tss/hiero/wraps/v0.2/wraps-v0.2.0.tar.gz',
    },
  };
}
```

### Step 5 — Create the YAML Config File

**New file:** `resources/config/tss-config.yaml`

```yaml
#schemaVersion: 1
tss:
  messageSizeSoftLimitBytes: 4194304     # 4 MiB
  messageSizeHardLimitBytes: 37748736    # 36 MiB — accommodates ~30 MiB genesis WRAPS proof
  timeoutAfterReadySeconds: 10
  readyMaxAttempts: 60
  readyBackoffSeconds: 3
  wraps:
    artifactsFolderName: wraps-v0.2.0
    directoryName: wraps-v0.2.0
    allowedKeyFiles: decider_pp.bin,decider_vp.bin,nova_pp.bin,nova_vp.bin
    # IMPORTANT: libDownloadUrl must be kept consistent with directoryName.
    libDownloadUrl: https://builds.hedera.com/tss/hiero/wraps/v0.2/wraps-v0.2.0.tar.gz
```

### Step 6 — Rename the Helm Chart YAML and Update `container-init.ts`

**Action:** Rename `resources/config/solo-config.yaml` → `resources/config/helm-chart-config.yaml`.

**File:** `src/core/dependency-injection/container-init.ts`

Four changes inside `factorySuppliers()`:

**6a.** Rename the local variable `defaultConfigSource` → `helmChartConfigSource`. Pass
`'HelmChartConfigSource'` as the fifth `sourceName` argument to `DefaultConfigSource`. Change the
filename string to `'helm-chart-config.yaml'`.

**6b.** Create a second source using the same `SoloConfigSchemaDefinition` (reused — no new schema
definition class needed):
```typescript
const tssConfigSource = new DefaultConfigSource<SoloConfigSchema>(
  'tss-config.yaml',
  PathEx.join('resources', 'config'),
  new SoloConfigSchemaDefinition(objectMapper),
  objectMapper,
  'TssConfigSource',
);
```

**6c.** Pass both sources to the builder:
```typescript
provider.builder()
  .withDefaultSources()
  .withSources(helmChartConfigSource, tssConfigSource)
  .withMergeSourceValues(true)
  .build();
```

The two YAML files contribute disjoint keys (`helmChart.*`, `clusterSetupHelmChart.*`, etc. vs.
`tss.*`), so no conflicts arise during merging. Both sources share `ordinal: 0`; `schemaVersion`
overlaps but will always be `1` in both.

### Step 7 — Update Command Consumers

Commands need access to TSS values. Since no new token is introduced, inject the existing
`InjectTokens.ConfigProvider` and resolve `SoloConfigSchema` from it.

**Files:** `src/commands/node/tasks.ts` and `src/commands/network.ts`

Add to each constructor:
```typescript
@inject(InjectTokens.ConfigProvider) private readonly configProvider: ConfigProvider,
```
Add the `patchInject` call. Access TSS values as:
```typescript
const tss = this.configProvider.config().asObject(SoloConfigSchema)?.tss;
```

Replace constants with `tss.*` property reads per the table in the *Constants to Migrate* section.

**`src/commands/node/tasks.ts` replacements:**

| Line(s) | Old constant | New access |
|---|---|---|
| 1533 | `constants.TSS_READY_MAX_ATTEMPTS` | `tss?.readyMaxAttempts` |
| 1552 | `constants.TIMEOUT_AFTER_TSS_IS_READY_IN_SECONDS` | `tss?.timeoutAfterReadySeconds` |
| 1555 | `constants.TSS_READY_BACKOFF_SECONDS` | `tss?.readyBackoffSeconds` |
| 3089, 3119, 3134 | `constants.WRAPS_DIRECTORY_NAME` | `tss?.wraps?.directoryName` |
| 3102 | `constants.WRAPS_ALLOWED_KEY_FILES` | `tss?.wraps?.allowedKeyFiles` |
| 3111 | `constants.WRAPS_LIB_DOWNLOAD_URL` | `tss?.wraps?.libDownloadUrl` |
| 3346, 3434, 3436, 3485, 3487 | `constants.TSS_LIB_WRAPS_ARTIFACTS_FOLDER_NAME` | `tss?.wraps?.artifactsFolderName` |

**`src/commands/network.ts` replacements:**

| Line(s) | Old constant | New access |
|---|---|---|
| 496, 498 | `constants.TSS_LIB_WRAPS_ARTIFACTS_FOLDER_NAME` | `tss?.wraps?.artifactsFolderName` |
| 1507, 1543 | `constants.WRAPS_DIRECTORY_NAME` | `tss?.wraps?.directoryName` |
| 1521, 1554 | `constants.WRAPS_ALLOWED_KEY_FILES` | `tss?.wraps?.allowedKeyFiles` |
| 1533 | `constants.WRAPS_LIB_DOWNLOAD_URL` | `tss?.wraps?.libDownloadUrl` |

### Step 8 — Thread Config to Message-Size Consumers

Search for `MESSAGE_SIZE_SOFT_LIMIT_BYTES_TSS` and `MESSAGE_SIZE_HARD_LIMIT_BYTES_TSS` outside
`constants.ts`:

```bash
grep -rn "MESSAGE_SIZE.*TSS" src/
```

For each non-injectable call site (e.g., `BlockNodesJsonWrapper`), pass the resolved values as
constructor parameters from the injectable parent that creates the wrapper.

### Step 9 — Remove Constants from `constants.ts`

**File:** `src/core/constants.ts`

Delete lines 409–482 (the nine TSS/WRAPS constants). Leave `BLOCK_NODE_TSS_VALUES_FILE` (line 272)
in place. Only do this after steps 7–8 are complete and the build is clean.

### Step 10 — Update Environment Variable Documentation

**File:** `docs/site/content/en/docs/env.md`

Update all TSS/WRAPS env var entries to reflect the new `SOLO_TSS_*` key path and the rename of
`WRAPS_ARTIFACT_LIB_DOWNLOAD_URL` → `SOLO_TSS_WRAPS_LIB_DOWNLOAD_URL`.

### Step 11 — Update Tests

**File:** `test/unit/commands/wraps-key-path.test.ts`

Replace references to `constants.WRAPS_ALLOWED_KEY_FILES` with a locally constructed `TssSchema`
instance containing test values.

Add migration tests (following patterns in `test/unit/data/schema/migration/impl/`):
- `SoloConfigV1Migration` with an empty source produces a `tss` object with all defaults
- Non-default values in the source are preserved through migration

---

## Critical Files

| File | Action |
|---|---|
| `src/data/configuration/impl/default-config-source.ts` | Add optional `sourceName` constructor param |
| `src/data/schema/model/solo/tss-schema.ts` | **Create** — `TssSchema` and `WrapsSchema` |
| `src/data/schema/model/solo/solo-config-schema.ts` | Add `tss: TssSchema \| undefined` field |
| `src/data/schema/migration/impl/solo/solo-config-v1-migration.ts` | Add `tss` default initialization |
| `resources/config/tss-config.yaml` | **Create** |
| `resources/config/solo-config.yaml` → `helm-chart-config.yaml` | **Rename** |
| `src/core/dependency-injection/container-init.ts` | Rename variable/filename, register second source |
| `src/core/constants.ts` | Remove 9 constants |
| `src/commands/node/tasks.ts` | Inject `ConfigProvider`, replace ~13 constant usages |
| `src/commands/network.ts` | Inject `ConfigProvider`, replace ~7 constant usages |
| `docs/site/content/en/docs/env.md` | Update env var names |
| `test/unit/commands/wraps-key-path.test.ts` | Update to use `TssSchema` directly |

No new `InjectToken` is added. No new `SchemaDefinition` or `SchemaMigration` class is added
(existing `SoloConfigSchemaDefinition` and `SoloConfigV1Migration` are extended instead).

---

## Verification

```bash
# Compile — must have zero errors
task build:compile

# All unit tests must pass
task test

# Confirm no remaining references to the removed constants
grep -rn "TSS_READY_MAX_ATTEMPTS\|WRAPS_DIRECTORY_NAME\|WRAPS_ALLOWED_KEY_FILES\|WRAPS_LIB_DOWNLOAD_URL\|TSS_LIB_WRAPS_ARTIFACTS_FOLDER_NAME\|MESSAGE_SIZE.*TSS\|TSS_READY_BACKOFF\|TIMEOUT_AFTER_TSS" src/

# Confirm old filename is no longer referenced
grep -rn "solo-config\.yaml" src/

# Confirm TSS config is loaded at runtime
npm run solo-test -- network deploy --help
```
