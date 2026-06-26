// SPDX-License-Identifier: Apache-2.0

import {type ComponentUpgradeMigrationStrategy} from './component-upgrade-rules-types.js';
import {type ComponentUpgradeBoundaryRule} from './component-upgrade-boundary-rule.js';

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
