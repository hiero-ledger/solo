// SPDX-License-Identifier: Apache-2.0

import {type CacheTargetStructure} from '../models/cache-target-structure.js';

/**
 * Supplies the cache subsystem with the targets that should be managed.
 *
 * Implementations may be:
 * - static
 * - configuration-driven
 * - deployment-aware
 */
export interface CacheTargetProvider {
  /**
   * Returns all targets that should be cached.
   */
  getRequiredTargets(): Promise<readonly CacheTargetStructure[]>;
}
