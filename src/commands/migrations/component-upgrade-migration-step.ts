// SPDX-License-Identifier: Apache-2.0

import {type ComponentUpgradeMigrationStrategy} from './component-upgrade-rules-types.js';

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
