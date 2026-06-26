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

export {type ComponentUpgradeBoundaryRule} from './component-upgrade-boundary-rule.js';
export {type ComponentUpgradeMigrationConfig} from './component-upgrade-migration-config.js';
export {type ComponentUpgradeMigrationConfigFile} from './component-upgrade-migration-config-file.js';
export {type ComponentUpgradeMigrationStep} from './component-upgrade-migration-step.js';
