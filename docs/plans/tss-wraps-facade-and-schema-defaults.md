# Plan: Schema Defaults, `Tss`/`Wraps` Facades, and Immutable Projected Config

## Context

After the `tss-config-yaml.md` migration, `TssSchema`, `WrapsSchema`, and `HelmChartSchema` carry
all their properties as `string | undefined` or `number | undefined`. This forces every call site
to use `?.` optional-chaining and `?? fallback` null-coalescing (e.g.,
`tss?.readyMaxAttempts ?? 60` in `tasks.ts:1539`, `labelSelector?.split(',') ?? []` in
`helm-chart.ts:78`). Defaults are scattered across multiple call sites instead of being declared
once at the schema level.

Additionally, the business layer accesses raw schema instances directly (e.g.,
`this.configProvider.config().asObject(SoloConfigSchema)?.tss?.wraps`) instead of using the
existing Facade layer. This violates the Business Layer Architecture standard which requires
projected configuration to be immutable and accessed only through well-defined facade APIs.

This plan:
1. Moves canonical defaults into schema class declarations.
2. Adds `@Type()` decorators for proper nested class-transformer deserialization.
3. Introduces `Wraps` and `Tss` facade classes (read-only projected configuration).
4. Updates `SoloConfig` to expose `tss: Tss` and deep-copies its schema for immutability.
5. Fixes `HelmChart` facade to remove `?.`/`??` usage.
6. Updates all call sites to go through the facade layer.
7. Adds an instruction to `CLAUDE.md` to consult the architecture docs on new features and major
   refactors.

---

## Canonical Default Values

These come from `SoloConfigV1Migration.getNewTssObject()`:

| Schema | Property | Default |
|---|---|---|
| `TssSchema` | `messageSizeSoftLimitBytes` | `4_194_304` |
| `TssSchema` | `messageSizeHardLimitBytes` | `37_748_736` |
| `TssSchema` | `timeoutAfterReadySeconds` | `10` |
| `TssSchema` | `readyMaxAttempts` | `60` |
| `TssSchema` | `readyBackoffSeconds` | `3` |
| `WrapsSchema` | `artifactsFolderName` | `'wraps-v0.2.0'` |
| `WrapsSchema` | `directoryName` | `'wraps-v0.2.0'` |
| `WrapsSchema` | `allowedKeyFiles` | `'decider_pp.bin,decider_vp.bin,nova_pp.bin,nova_vp.bin'` |
| `WrapsSchema` | `libraryDownloadUrl` | `'https://builds.hedera.com/tss/hiero/wraps/v0.2/wraps-v0.2.0.tar.gz'` |
| `HelmChartSchema` | all 11 string properties | `''` (empty string) |

---

## Implementation Steps

### Step 1 — Add Defaults to `WrapsSchema` and Remove `| undefined`

**File:** `src/data/schema/model/solo/tss-schema.ts`

Change each `string | undefined` property to `string` and assign its canonical default in the
property declaration. Update the constructor to assign defaults when arguments are absent:

```typescript
@Exclude()
export class WrapsSchema {
  @Expose()
  public artifactsFolderName: string = 'wraps-v0.2.0';

  @Expose()
  public directoryName: string = 'wraps-v0.2.0';

  @Expose()
  public allowedKeyFiles: string = 'decider_pp.bin,decider_vp.bin,nova_pp.bin,nova_vp.bin';

  // IMPORTANT: libraryDownloadUrl must be kept consistent with directoryName.
  @Expose()
  public libraryDownloadUrl: string = 'https://builds.hedera.com/tss/hiero/wraps/v0.2/wraps-v0.2.0.tar.gz';

  public constructor(
    artifactsFolderName?: string,
    directoryName?: string,
    allowedKeyFiles?: string,
    libraryDownloadUrl?: string,
  ) {
    if (artifactsFolderName !== undefined) this.artifactsFolderName = artifactsFolderName;
    if (directoryName !== undefined) this.directoryName = directoryName;
    if (allowedKeyFiles !== undefined) this.allowedKeyFiles = allowedKeyFiles;
    if (libraryDownloadUrl !== undefined) this.libraryDownloadUrl = libraryDownloadUrl;
  }
}
```

### Step 2 — Add Defaults to `TssSchema`, Add `@Type()` for `wraps`

**File:** `src/data/schema/model/solo/tss-schema.ts`

Change `number | undefined` to `number` with canonical defaults. Change `WrapsSchema | undefined`
to `WrapsSchema` with a default instance. Add `@Type(() => WrapsSchema)` so class-transformer
instantiates `WrapsSchema` (with its own defaults) when deserializing nested YAML:

```typescript
@Exclude()
export class TssSchema {
  @Expose()
  public messageSizeSoftLimitBytes: number = 4_194_304;

  @Expose()
  public messageSizeHardLimitBytes: number = 37_748_736;

  @Expose()
  public timeoutAfterReadySeconds: number = 10;

  @Expose()
  public readyMaxAttempts: number = 60;

  @Expose()
  public readyBackoffSeconds: number = 3;

  @Expose()
  @Type((): typeof WrapsSchema => WrapsSchema)
  public wraps: WrapsSchema = new WrapsSchema();

  public constructor(
    messageSizeSoftLimitBytes?: number,
    messageSizeHardLimitBytes?: number,
    timeoutAfterReadySeconds?: number,
    readyMaxAttempts?: number,
    readyBackoffSeconds?: number,
    wraps?: WrapsSchema,
  ) {
    if (messageSizeSoftLimitBytes !== undefined) this.messageSizeSoftLimitBytes = messageSizeSoftLimitBytes;
    if (messageSizeHardLimitBytes !== undefined) this.messageSizeHardLimitBytes = messageSizeHardLimitBytes;
    if (timeoutAfterReadySeconds !== undefined) this.timeoutAfterReadySeconds = timeoutAfterReadySeconds;
    if (readyMaxAttempts !== undefined) this.readyMaxAttempts = readyMaxAttempts;
    if (readyBackoffSeconds !== undefined) this.readyBackoffSeconds = readyBackoffSeconds;
    if (wraps !== undefined) this.wraps = wraps;
  }
}
```

### Step 3 — Add Defaults and `@Type()` to `HelmChartSchema`

**File:** `src/data/schema/model/common/helm-chart-schema.ts`

Change every `string | undefined` to `string` with default `''`. Update constructor similarly:

```typescript
@Exclude()
export class HelmChartSchema {
  @Expose() public name: string = '';
  @Expose() public namespace: string = '';
  @Expose() public release: string = '';
  @Expose() public repository: string = '';
  @Expose() public directory: string = '';
  @Expose() public version: string = '';
  @Expose() public labelSelector: string = '';
  @Expose() public containerName: string = '';
  @Expose() public ingressClassName: string = '';
  @Expose() public ingressControllerName: string = '';
  @Expose() public ingressControllerPrefix: string = '';

  public constructor(
    name?: string, namespace?: string, release?: string, repository?: string,
    directory?: string, version?: string, labelSelector?: string, containerName?: string,
    ingressClassName?: string, ingressControllerName?: string, ingressControllerPrefix?: string,
  ) {
    if (name !== undefined) this.name = name;
    if (namespace !== undefined) this.namespace = namespace;
    // ... same pattern for all properties
  }
}
```

### Step 4 — Add `@Type()` Decorators to `SoloConfigSchema`

**File:** `src/data/schema/model/solo/solo-config-schema.ts`

Add `@Type()` decorators on each helm chart field and on `tss` so class-transformer instantiates
the correct class (with property defaults) when deserializing nested YAML:

```typescript
@Expose()
@Type((): typeof HelmChartSchema => HelmChartSchema)
public helmChart: HelmChartSchema = new HelmChartSchema();

@Expose()
@Type((): typeof HelmChartSchema => HelmChartSchema)
public ingressControllerHelmChart: HelmChartSchema = new HelmChartSchema();

// ... same for clusterSetupHelmChart, certManagerHelmChart

@Expose()
@Type((): typeof TssSchema => TssSchema)
public tss: TssSchema = new TssSchema();
```

Remove `| undefined` from all four helm chart fields and from `tss`.

### Step 5 — Create `Wraps` Facade

**New file:** `src/business/runtime-state/config/solo/wraps.ts`

Read-only projected configuration — no setters:

```typescript
import {type Facade} from '../../facade/facade.js';
import {WrapsSchema} from '../../../../data/schema/model/solo/tss-schema.js';

export class Wraps implements Facade<WrapsSchema> {
  public constructor(public readonly encapsulatedObject: WrapsSchema) {}

  public get artifactsFolderName(): string { return this.encapsulatedObject.artifactsFolderName; }
  public get directoryName(): string { return this.encapsulatedObject.directoryName; }
  public get allowedKeyFiles(): string { return this.encapsulatedObject.allowedKeyFiles; }
  public get libraryDownloadUrl(): string { return this.encapsulatedObject.libraryDownloadUrl; }

  /** Parses allowedKeyFiles into a Set for O(1) membership checks. */
  public get allowedKeyFileSet(): Set<string> {
    return new Set(this.encapsulatedObject.allowedKeyFiles.split(',').filter(Boolean));
  }
}
```

### Step 6 — Create `Tss` Facade

**New file:** `src/business/runtime-state/config/solo/tss.ts`

Read-only projected configuration — no setters:

```typescript
import {type Facade} from '../../facade/facade.js';
import {TssSchema} from '../../../../data/schema/model/solo/tss-schema.js';
import {Wraps} from './wraps.js';

export class Tss implements Facade<TssSchema> {
  private readonly _wraps: Wraps;

  public constructor(public readonly encapsulatedObject: TssSchema) {
    this._wraps = new Wraps(encapsulatedObject.wraps);
  }

  public get messageSizeSoftLimitBytes(): number { return this.encapsulatedObject.messageSizeSoftLimitBytes; }
  public get messageSizeHardLimitBytes(): number { return this.encapsulatedObject.messageSizeHardLimitBytes; }
  public get timeoutAfterReadySeconds(): number { return this.encapsulatedObject.timeoutAfterReadySeconds; }
  public get readyMaxAttempts(): number { return this.encapsulatedObject.readyMaxAttempts; }
  public get readyBackoffSeconds(): number { return this.encapsulatedObject.readyBackoffSeconds; }
  public get wraps(): Wraps { return this._wraps; }
}
```

### Step 7 — Update `SoloConfig` Facade

**File:** `src/business/runtime-state/config/solo/solo-config.ts`

Add `_tss: Tss` and expose it. Deep-copy the encapsulated schema via a class-transformer
round-trip to enforce immutability (prevents callers from mutating config data through the
schema reference):

```typescript
import {instanceToPlain, plainToInstance} from 'class-transformer';
import {Tss} from './tss.js';

export class SoloConfig implements Facade<SoloConfigSchema> {
  private readonly _helmChart: HelmChart;
  private readonly _ingressControllerHelmChart: HelmChart;
  private readonly _clusterSetupHelmChart: HelmChart;
  private readonly _certManagerHelmChart: HelmChart;
  private readonly _tss: Tss;

  public constructor(schema: SoloConfigSchema) {
    // Deep copy for immutability — business layer cannot mutate config data through the schema ref
    this.encapsulatedObject = plainToInstance(SoloConfigSchema, instanceToPlain(schema ?? new SoloConfigSchema()));
    this._helmChart = new HelmChart(this.encapsulatedObject.helmChart);
    this._ingressControllerHelmChart = new HelmChart(this.encapsulatedObject.ingressControllerHelmChart);
    this._clusterSetupHelmChart = new HelmChart(this.encapsulatedObject.clusterSetupHelmChart);
    this._certManagerHelmChart = new HelmChart(this.encapsulatedObject.certManagerHelmChart);
    this._tss = new Tss(this.encapsulatedObject.tss);
  }

  public readonly encapsulatedObject: SoloConfigSchema;

  public get helmChart(): HelmChart { return this._helmChart; }
  public get ingressControllerHelmChart(): HelmChart { return this._ingressControllerHelmChart; }
  public get clusterSetupHelmChart(): HelmChart { return this._clusterSetupHelmChart; }
  public get certManagerHelmChart(): HelmChart { return this._certManagerHelmChart; }
  public get tss(): Tss { return this._tss; }
}
```

### Step 8 — Fix `HelmChart` Facade

**File:** `src/business/runtime-state/config/common/helm-chart.ts`

With `HelmChartSchema` properties now typed as `string` (never `undefined`), remove `?.` and `??`:

```typescript
// Before (line 78):
public get labels(): string[] {
  return this.encapsulatedObject.labelSelector?.split(',') ?? [];
}

// After:
public get labels(): string[] {
  return this.encapsulatedObject.labelSelector.split(',').filter(Boolean);
}
```

All other getters already declare return type `string` and will now type-check cleanly without
`!` assertions.

Also update the constructor to handle the `null`/`undefined` guard using `new HelmChartSchema()`
(already in place) — no change needed there.

### Step 9 — Update Call Sites to Use `SoloConfig` Facade

Replace every direct raw-schema access with a `SoloConfig` facade instance.

**`src/commands/node/tasks.ts`** (lines 1538, 3095, 3359, 3450, 3502):

```typescript
// Before:
const tss: TssSchema | undefined = this.configProvider.config().asObject(SoloConfigSchema)?.tss;
const maxAttempts: number = tss?.readyMaxAttempts ?? 60;
// ...
await sleep(Duration.ofSeconds(tss?.timeoutAfterReadySeconds ?? 10));
// ...
await sleep(Duration.ofSeconds(tss?.readyBackoffSeconds ?? 3));

// After:
const soloConfig: SoloConfig = new SoloConfig(this.configProvider.config().asObject(SoloConfigSchema));
const maxAttempts: number = soloConfig.tss.readyMaxAttempts;
// ...
await sleep(Duration.ofSeconds(soloConfig.tss.timeoutAfterReadySeconds));
// ...
await sleep(Duration.ofSeconds(soloConfig.tss.readyBackoffSeconds));
```

For `wraps` access (lines 3095, 3359, 3450, 3502):

```typescript
// Before:
const wraps: WrapsSchema | undefined = this.configProvider.config().asObject(SoloConfigSchema)?.tss?.wraps;
const directoryName = wraps?.directoryName ?? 'wraps-v0.2.0';
const allowedFiles = new Set((wraps?.allowedKeyFiles ?? '').split(','));

// After:
const soloConfig: SoloConfig = new SoloConfig(this.configProvider.config().asObject(SoloConfigSchema));
const wraps: Wraps = soloConfig.tss.wraps;
const directoryName: string = wraps.directoryName;
const allowedFiles: Set<string> = wraps.allowedKeyFileSet;
```

**`src/commands/network.ts`** (lines 503, 1514 and similar):

Same pattern — create `SoloConfig` from `configProvider`, access `soloConfig.tss.wraps.*`.

**`src/core/block-nodes-json-wrapper.ts`** (lines 98–103, 121–126):

```typescript
// Before:
const soloConfig: SoloConfigSchema | null = this.configProvider.config().asObject(SoloConfigSchema);
const tssMessageSizeFields: BlockNodeConnectionDataBase = this.tssEnabled
  ? {
      messageSizeSoftLimitBytes: soloConfig?.tss?.messageSizeSoftLimitBytes,
      messageSizeHardLimitBytes: soloConfig?.tss?.messageSizeHardLimitBytes,
    }
  : {};

// After:
const soloConfig: SoloConfig = new SoloConfig(this.configProvider.config().asObject(SoloConfigSchema));
const tssMessageSizeFields: BlockNodeConnectionDataBase = this.tssEnabled
  ? {
      messageSizeSoftLimitBytes: soloConfig.tss.messageSizeSoftLimitBytes,
      messageSizeHardLimitBytes: soloConfig.tss.messageSizeHardLimitBytes,
    }
  : {};
```

### Step 10 — Update `CLAUDE.md`

**File:** `CLAUDE.md`

Add a new section after the existing **Coding Standards** section:

```markdown
## Architecture and Design

Before implementing a new feature or undertaking a major refactor, review the architecture and
design documentation under [`docs/design/architecture/`](docs/design/architecture/) and align the
implementation with the patterns and standards described there.

For small enhancements to existing features or bug fixes, architectural alignment is not required.
```

---

## Critical Files

| File | Action |
|---|---|
| `src/data/schema/model/solo/tss-schema.ts` | Add defaults + `@Type(() => WrapsSchema)` on `wraps`; remove `\| undefined` |
| `src/data/schema/model/common/helm-chart-schema.ts` | Add `''` defaults; remove `\| undefined` |
| `src/data/schema/model/solo/solo-config-schema.ts` | Add `@Type()` decorators; add `TssSchema` default; remove `\| undefined` |
| `src/business/runtime-state/config/solo/wraps.ts` | **Create** — `Wraps` facade |
| `src/business/runtime-state/config/solo/tss.ts` | **Create** — `Tss` facade |
| `src/business/runtime-state/config/solo/solo-config.ts` | Add `_tss: Tss`; deep-copy schema for immutability |
| `src/business/runtime-state/config/common/helm-chart.ts` | Fix `labels` getter; remove `?.`/`??` |
| `src/commands/node/tasks.ts` | Replace raw `TssSchema`/`WrapsSchema` access with `SoloConfig` facade (5 sites) |
| `src/commands/network.ts` | Replace raw schema access with `SoloConfig` facade (3 sites) |
| `src/core/block-nodes-json-wrapper.ts` | Replace raw schema access with `SoloConfig` facade (2 sites) |
| `CLAUDE.md` | Add architecture review instruction |

---

## Reusable Utilities

- `instanceToPlain` / `plainToInstance` from `class-transformer` — used in `SoloConfig` for deep copy
- `Transformations` in `src/data/schema/model/utils/transformations.ts` — existing pattern for `@Transform` helpers (no new entry needed for this plan)
- `Facade<T>` interface at `src/business/runtime-state/facade/facade.ts` — implemented by both new facade classes

---

## Verification

```bash
# 1. Compile — must have zero TypeScript errors
task build:compile

# 2. All unit tests must pass
task test

# 3. Confirm no remaining optional-chain access on tss or wraps in business-layer callers
grep -rn "tss?\." src/commands/ src/core/block-nodes-json-wrapper.ts
grep -rn "wraps?\." src/commands/ src/core/block-nodes-json-wrapper.ts

# 4. Confirm schema types no longer carry | undefined
grep -n "undefined" src/data/schema/model/solo/tss-schema.ts
grep -n "undefined" src/data/schema/model/common/helm-chart-schema.ts

# 5. Smoke test — confirm config loads and TSS defaults are present
npm run solo-test -- node start --help
```
