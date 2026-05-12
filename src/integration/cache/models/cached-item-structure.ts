// SPDX-License-Identifier: Apache-2.0

import {type CacheTargetStructure} from './cache-target-structure.js';

/**
 * Represents a target that has already been cached locally.
 *
 * This is the persisted view of a cached entry and should be safe
 * to serialize into the cache catalog.
 */
export interface CachedItemStructure {
  /**
   * The original cache target definition.
   */
  readonly target: CacheTargetStructure;

  /**
   * Absolute path to the cached file on disk.
   *
   * Examples:
   * - "/Users/me/.solo/cache/images/ghcr.io__repo__image__0.23.2.tar"
   * - "/Users/me/.solo/cache/charts/solo-deployment__0.62.0.tgz"
   */
  readonly localPath: string;

  /**
   * ISO-8601 timestamp recording when the item was cached.
   */
  readonly cachedAt: string;
}
