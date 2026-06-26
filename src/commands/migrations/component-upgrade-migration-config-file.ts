// SPDX-License-Identifier: Apache-2.0

import {type ComponentUpgradeMigrationConfig} from './component-upgrade-migration-config.js';

/**
 * Top-level config file structure. Maps component names (e.g., 'block-node') to their
 * individual migration configs. This is the shape of both the embedded default config
 * and the optional external JSON override file.
 */
export interface ComponentUpgradeMigrationConfigFile {
  components: Record<string, ComponentUpgradeMigrationConfig>;
}
