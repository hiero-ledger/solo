// SPDX-License-Identifier: Apache-2.0

import {type CacheTargetStructure} from './cache-target-structure.js';

/**
 * Aggregated status of the cache subsystem.
 *
 * This is the top-level status model returned by the cache facade.
 */
export interface CacheStatusStructure {
  /**
   * Whether the overall cache is healthy.
   */
  readonly healthy: boolean;

  /**
   * Total number of cached targets tracked by the catalog.
   */
  readonly totalItems: number;

  /**
   * Total size of cached files in bytes.
   */
  readonly totalSizeBytes: number;

  /**
   * Targets that are expected but currently missing or invalid.
   */
  readonly missingTargets: readonly CacheTargetStructure[];
}
