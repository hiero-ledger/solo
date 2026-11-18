// SPDX-License-Identifier: Apache-2.0

import {type VersionRange} from '../utils/version-range.js';
import {type ChartMigrationContext} from './chart-migration-context.js';

/**
 * A migration that carries a Helm release across a chart version boundary: a chart release that stops generating a
 * value, renames or restructures a value, or otherwise needs state from the deployed release that a fresh render of
 * the new chart would not reproduce.
 *
 * A migration declares the deployed chart versions it applies to in {@link range}, the same way a `SchemaMigration`
 * does for configuration schema versions. It runs during `ChartManager.upgrade` when the deployed chart version of
 * the release lies in that range and the target version is at or after the end of the range — that is, when the
 * upgrade crosses `range.end`. A migration for "upgrading from below 0.157.0 to 0.157.0 or later" declares the range
 * `[0.0.0, 0.157.0)`.
 *
 * Register a migration in `ChartMigrationRegistry`. See
 * `docs/design/architecture/component/helm-chart-migrations.md` for the design and a worked example.
 */
export interface ChartMigration {
  /** A unique, descriptive name, shown in logs and errors (e.g. `mirror-node-block-node-endpoints`). */
  readonly name: string;

  /**
   * The chart the migration applies to: the chart name of the deployed release as Helm reports it, which is `name` in
   * the chart's `Chart.yaml` (e.g. `hedera-mirror`, `hiero-explorer-chart`). It is not the release name, nor the
   * chart reference the command upgrades from, which may be an alias, an OCI URL or a local directory.
   */
  readonly chartName: string;

  /**
   * The deployed chart versions the migration applies to: `begin` inclusive, `end` exclusive. The migration runs only
   * when the target version is at or after `end`. Use a `-0` pre-release suffix on `end` (e.g. `0.157.0-0`) to treat
   * the pre-releases of the boundary version as already past it.
   */
  readonly range: VersionRange<string>;

  /**
   * Runs before `helm upgrade`. Read the deployed release or the cluster through the context, and contribute values
   * for the upgraded release through {@link ChartMigrationContext.carryReleaseValues} or
   * {@link ChartMigrationContext.addInheritedValues}.
   *
   * @param context - the release being upgraded and the values contributed by earlier migrations
   */
  beforeUpgrade(context: ChartMigrationContext): Promise<void>;

  /**
   * Runs after `helm upgrade` succeeds, e.g. to remove resources the new chart no longer manages. Skipped when the
   * upgrade fails.
   *
   * @param context - the same context {@link beforeUpgrade} received
   */
  afterUpgrade?(context: ChartMigrationContext): Promise<void>;
}
