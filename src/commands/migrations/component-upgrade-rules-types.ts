// SPDX-License-Identifier: Apache-2.0

/**
 * The two possible upgrade strategies:
 * - `'in-place'`: Perform a standard Helm upgrade. The existing pods are updated in-place.
 *   Fast and non-destructive, but fails if the chart introduces immutable field changes.
 * - `'recreate'`: Delete the existing Helm release and reinstall from scratch. Required when
 *   Kubernetes immutable fields (e.g., StatefulSet volumeClaimTemplates, selector) have changed.
 *   More disruptive but guaranteed to work across any chart change.
 */
export type ComponentUpgradeMigrationStrategy = 'in-place' | 'recreate';

/**
 * A single boundary rule that defines a version threshold where the upgrade strategy changes.
 *
 * When an upgrade crosses this version (i.e., `currentVersion < version <= targetVersion`),
 * the specified strategy is applied for that segment of the upgrade path.
 *
 * @property version - The semver version string representing the boundary (e.g., '0.28.0').
 *   Any upgrade that moves from below this version to at-or-above it triggers this rule.
 * @property strategy - The upgrade strategy required when crossing this boundary.
 * @property reason - A human-readable explanation of why this boundary exists (e.g., which
 *   immutable field changed). Shown in task output for operator visibility.
 * @property extraCommandArgs - Optional additional Helm CLI arguments to pass during this
 *   migration step (e.g., extra `--set` values needed for the transition).
 */
export interface ComponentUpgradeBoundaryRule {
  version: string;
  strategy: ComponentUpgradeMigrationStrategy;
  reason: string;
  extraCommandArgs?: string[];
}

/**
 * Per-component migration configuration containing the default strategy and all known
 * version boundaries.
 *
 * @property defaultStrategy - The strategy used when no boundaries are crossed (or for
 *   the final segment after the last boundary). Typically `'in-place'`.
 * @property defaultExtraCommandArgs - Extra Helm CLI arguments applied to all steps that
 *   use the default strategy.
 * @property boundaries - Ordered list of version boundaries. Each one marks a version
 *   that may require a different strategy when crossed.
 */
export interface ComponentUpgradeMigrationConfig {
  defaultStrategy: ComponentUpgradeMigrationStrategy;
  defaultExtraCommandArgs?: string[];
  boundaries: ComponentUpgradeBoundaryRule[];
}

/**
 * Top-level config file structure. Maps component names (e.g., 'block-node') to their
 * individual migration configs. This is the shape of both the embedded default config
 * and the optional external JSON override file.
 */
export interface ComponentUpgradeMigrationConfigFile {
  components: Record<string, ComponentUpgradeMigrationConfig>;
}

/**
 * A single step in the computed migration plan. The planner returns an ordered array of
 * these steps, each representing one segment of the upgrade path.
 *
 * The caller executes these steps sequentially:
 * - For `'recreate'`: uninstall the chart, wait for pod cleanup, reinstall at `toVersion`.
 * - For `'in-place'`: run `helm upgrade` to `toVersion`.
 *
 * @property fromVersion - The starting version for this step (normalized semver).
 * @property toVersion - The target version for this step (normalized semver).
 * @property strategy - How to perform this particular upgrade segment.
 * @property reason - Human-readable explanation of why this strategy was chosen.
 * @property extraCommandArgs - Additional Helm CLI arguments for this step.
 */
export interface ComponentUpgradeMigrationStep {
  fromVersion: string;
  toVersion: string;
  strategy: ComponentUpgradeMigrationStrategy;
  reason: string;
  extraCommandArgs: string[];
}
