// SPDX-License-Identifier: Apache-2.0

import {type CachedItemStructure} from '../models/cached-item-structure.js';
import {type CacheStatusStructure} from '../models/cache-status-structure.js';

/**
 * Facade entry point for the cache subsystem.
 *
 * This is the single interface the rest of the application should use
 * to manage cached images and charts.
 */
export interface CacheCoordinator {
  /**
   * Pulls and stores all required cache targets.
   */
  pull(): Promise<void>;

  /**
   * Returns all cached items currently tracked by the cache catalog.
   */
  list(): Promise<readonly CachedItemStructure[]>;

  /**
   * Clears the cache.
   */
  clear(): Promise<void>;

  /**
   * Returns the aggregated cache status.
   */
  status(): Promise<CacheStatusStructure>;
}
