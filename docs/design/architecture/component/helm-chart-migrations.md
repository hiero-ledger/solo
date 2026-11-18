# Helm Chart Migrations

## 1. Context

Solo already migrates its own state across versions: local, remote and Solo configuration each declare a chain of
`SchemaMigration`s (`src/data/schema/migration/`) that rewrite stored data from one schema version to the next.

Helm releases need the same treatment. A chart release can stop generating a value, rename or restructure one, or
start depending on a value the old release never set. A plain `helm upgrade` across that boundary then either fails
or silently drops configuration:

- With `--reuse-values`, Helm merges the old release values back in, including keys the new chart rejects. For
  example, mirror node v0.157.0 moved block node importer properties from `nodes[].host/port` to
  `nodes[].endpoints[].host/port`, and the importer fails strict binding on the stale keys.
- Without `--reuse-values`, every value set at install time and not supplied again (for example a `--values-file`
  passed to `mirror node add`) is lost.

Until now, each command has handled these boundaries by hand. `MirrorNodeCommand.shouldReuseValuesOnUpgrade()` turns
`--reuse-values` off when an upgrade crosses a known boundary, and PR #6414 reads the release values, rewrites them and
passes them back as a low-precedence values file. This document describes the framework that generalises that pattern
(issue #2522).

## 2. Goals

- A chart migration declares the deployed chart versions it applies to, the same way `SchemaMigration` declares its
  source versions, and runs automatically when an upgrade crosses its boundary.
- A migration holds its own logic and can act before and after the upgrade: read the deployed release or the cluster,
  and feed the result into the `helm upgrade` as extra values.
- Every chart upgrade gets this without command-specific wiring: the framework runs inside `ChartManager.upgrade`.
- Values the user or Solo supplies for the upgrade always win over values a migration contributes.
- No cost for upgrades of charts that have no migrations: no extra Helm calls.

## 3. Non-Goals

- **Upgrade strategy.** Choosing between an in-place `helm upgrade` and an uninstall/reinstall stays with
  `ComponentUpgradeMigrationRules` (`src/commands/migrations/`), which block node uses for StatefulSet changes that
  Kubernetes cannot apply in place. See section 7.
- **Downgrades.** A migration only runs for an upgrade that crosses its boundary going forward.
- **Concrete migrations.** This change ships the framework and the Helm plumbing; the mirror node migration from
  PR #6414 moves onto it separately.

## 4. Design

### 4.1 Components

All types live in `src/business/chart-migration/`.

| Type                     | Role                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChartMigration`         | Interface a migration implements: `name`, `chartName`, `range`, `beforeUpgrade(context)`, optional `afterUpgrade(context)`.                       |
| `ChartMigrationContext`  | What a migration sees: the release, the deployed and target chart versions, the release values, and the methods to contribute values.             |
| `ChartMigrationRegistry` | The list of known migrations. Adding a migration means adding an instance here.                                                                   |
| `ChartMigrator`          | Selects the migrations that apply to an upgrade, runs their hooks around it, writes the contributed values to files and settles `--reuse-values`. |
| `ChartMigrationSession`  | The `ChartMigrationContext` implementation: holds the state of one upgrade shared by its migrations.                                              |

The Helm plumbing it relies on:

- `HelmClient.getValues()` (`helm get values -o json`, via `ReleaseGetValuesRequest`) reads the user-supplied values of
  a deployed release.
- `ReleaseItem.chartVersion` parses the deployed chart version from `helm list` output (`<chart name>-<version>`).

### 4.2 When a migration applies

A migration declares a `VersionRange<string>` of deployed chart versions, `begin` inclusive and `end` exclusive. It
applies to an upgrade when:

```text
range.begin <= deployed chart version < range.end   and   target chart version >= range.end
```

That is, the upgrade crosses `range.end`. "Upgrading from below 0.157.0 to 0.157.0 or later" is the range
`[0.0.0, 0.157.0)`. A later `begin` narrows the migration to releases that are already past an earlier boundary, as
PR #6414 does for releases before the v0.152.0 shared-resources change.

`range.end` follows `SemanticVersion` ordering, where a pre-release sorts before its release. To treat the
pre-releases of the boundary version (e.g. `0.157.0-rc1`) as already past it, end the range at `0.157.0-0`, matching
`MirrorNodeCommand.MINIMUM_MIRROR_NODE_CHART_VERSION_FOR_BLOCK_NODE_ENDPOINTS`.

Migrations are matched on the chart name the caller passes to `ChartManager.upgrade` (e.g.
`constants.MIRROR_NODE_CHART`), not the release name, so they cover every release of the chart.

The deployed version comes from the cluster (`helm list`), not from the remote config: it is the version Helm will
upgrade from, and it is available for every chart, including charts that are not tracked components. The framework
skips migrations, logging why at debug level, when:

- the chart has no registered migration (no Helm call is made at all);
- the release is not installed yet (`helm upgrade --install` of a new release);
- the deployed chart reports no version, or the target version is empty or not a semantic version.

### 4.3 Lifecycle

```text
ChartManager.upgrade
  └─ ChartMigrator.upgrade
       1. select the applicable migrations, ordered by range.end, then range.begin
       2. beforeUpgrade(context) for each migration, in order
       3. write the contributed values to owner-only files in a temporary directory
       4. helm upgrade  --values <migration files>  <Solo values>  <user values>
       5. remove the temporary directory (also when the upgrade fails)
       6. afterUpgrade(context) for each migration that defines it, only if the upgrade succeeded
```

Ordering by boundary means a release crossing several boundaries is rewritten oldest boundary first, like a schema
migration chain.

### 4.4 Contributing values

A migration contributes values in one of two ways:

- **`carryReleaseValues(values)`** carries the deployed release's values into the upgraded release, rewritten for the
  new chart. It replaces whatever an earlier migration carried, and `releaseValues()` returns the values carried so far
  (or the deployed values, read once per upgrade, if none were carried), so migrations across several boundaries each
  rewrite the output of the previous one. Carrying values replaces `--reuse-values`: reusing would merge the original,
  un-migrated values back in and undo the rewrite, so the upgrade runs without it.
- **`addInheritedValues(values)`** adds values the old release implied but the new chart no longer generates, typically
  derived from cluster state. These are layered on top, so `--reuse-values` is kept when the caller asked for it.

Helm receives the values in this order, lowest precedence first:

1. values reused from the deployed release (`--reuse-values`, unless a migration carried values)
2. carried release values
3. inherited values, in the order they were added
4. values Solo computes for the upgrade
5. values files the user supplies

Release values can hold secrets such as database passwords, so the files are written owner-only
(`FilePermissions.restrictToOwner`) to a fresh temporary directory, which is removed as soon as Helm has read them.
The context hands out copies, so a migration cannot change values it has already contributed or that another
migration will read.

### 4.5 Errors

- A failing hook stops the upgrade and is reported as `HelmChartMigrationFailedSoloError` (`SOLO-5097`), naming the
  migration and the release. If `beforeUpgrade` fails, `helm upgrade` does not run. `ChartManager.upgrade` lets this
  error through instead of wrapping it in `HelmChartUpgradeFailedSoloError`.
- Failing to read the release values raises `HelmReleaseValuesReadFailedSoloError` (`SOLO-5096`) rather than returning
  empty values: carrying on would silently drop them.

## 5. Adding a migration

1. Implement `ChartMigration` in `src/business/chart-migration/impl/<chart>-<change>-chart-migration.ts`, one class per
   file. Keep the value rewriting in pure, unit-tested methods. A migration that needs other services, for example a
   `K8Factory` to read cluster state, injects them with `@inject` and `patchInject` like any other Solo service.
2. Append an instance to `ChartMigrationRegistry`.
3. Remove the hand-written handling the migration replaces, such as a version check that disables `--reuse-values`.
4. Cover it in the `examples/version-upgrade-test` scenario: install below the boundary, upgrade across it, and assert
   on the upgraded release.

A migration for the mirror node block node endpoints change in PR #6414 would look like this:

```typescript
export class MirrorNodeBlockNodeEndpointsChartMigration implements ChartMigration {
  public readonly name: string = 'mirror-node-block-node-endpoints';
  public readonly chartName: string = constants.MIRROR_NODE_CHART;
  public readonly range: VersionRange<string> = VersionRange.fromSemanticVersionBounds(
    new SemanticVersion<string>(versions.MEMORY_ENHANCEMENTS_MIRROR_NODE_VERSION),
    new SemanticVersion<string>('0.157.0-0'),
  );

  public async beforeUpgrade(context: ChartMigrationContext): Promise<void> {
    const values: Record<string, unknown> = await context.releaseValues();
    context.carryReleaseValues(MirrorNodeBlockNodeEndpointsChartMigration.migrateBlockNodeEndpoints(values));
  }

  // ...the pure value rewriting from MirrorNodeValuesMigrator
}
```

## 6. Testing

- `test/unit/business/chart-migration/chart-migrator.test.ts` covers range matching (including pre-release
  boundaries), ordering, chaining of carried values, `--reuse-values` handling, the precedence of the values files,
  removal of the temporary files and error reporting.
- `test/unit/core/chart-manager.test.ts` covers the hand-off between `ChartManager.upgrade` and the migrator.
- `test/unit/business/chart-migration/chart-migration-registry.test.ts` guards the registered migrations.
- Each concrete migration needs unit tests for its value rewriting and an end-to-end upgrade across its boundary.

## 7. Relation to `ComponentUpgradeMigrationRules`

Block node's `ComponentUpgradeMigrationRules` plans _how_ to upgrade: a JSON-configured list of version boundaries
that pick an `in-place` or `recreate` strategy per segment, executed by `BlockNodeCommand`. Chart migrations decide
_with what values_ to upgrade, and hold code rather than configuration. The two solve different problems and coexist.

They could later be unified by adding a strategy to `ChartMigration` (e.g. a migration that requires the release to be
recreated), with `ChartManager` performing the uninstall and reinstall. That would let every chart use recreate
boundaries without command-specific code, but it changes the block node upgrade path and is out of scope here.
