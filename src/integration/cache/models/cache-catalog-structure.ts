// SPDX-License-Identifier: Apache-2.0

import {type CachedItemStructure} from './cached-item-structure.js';

/**
 * In-memory representation of the cache index.
 *
 * The catalog is the metadata view of what is expected to exist in the cache.
 */
export interface CacheCatalogStructure {
  /**
   * Catalog schema version.
   */
  readonly version: string;

  /**
   * Solo version associated with this catalog.
   */
  readonly soloVersion: string;

  /**
   * All cached items currently tracked by the cache subsystem.
   */
  readonly items: readonly CachedItemStructure[];
}
