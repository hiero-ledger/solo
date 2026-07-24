// SPDX-License-Identifier: Apache-2.0

import {type ComponentUpgradeMigrationStrategy} from './component-upgrade-rules-types.js';

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
