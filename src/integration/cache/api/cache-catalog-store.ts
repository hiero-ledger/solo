// SPDX-License-Identifier: Apache-2.0

import {type CacheCatalogStructure} from '../models/cache-catalog-structure.js';
import {type CacheTargetStructure} from '../models/cache-target-structure.js';
import {type CacheArtifactEnum} from '../enums/cache-artifact-enum.js';

/**
 * Persistence contract for storing and retrieving cache metadata.
 *
 * This interface is responsible only for catalog persistence and path resolution.
 * It must not contain cache business logic.
 */
export interface CacheCatalogStore {
  /**
   * Saves the provided catalog.
   */
  save(catalog: CacheCatalogStructure): Promise<void>;

  /**
   * Loads the current catalog.
   */
  load(): Promise<CacheCatalogStructure>;

  /**
   * Checks whether a catalog currently exists.
   */
  exists(): Promise<boolean>;

  /**
   * Removes the persisted catalog and any store-owned metadata.
   */
  clear(): Promise<void>;

  /**
   * Resolves the canonical local file path for the provided target.
   */
  resolvePath(target: CacheTargetStructure, directoryPath: CacheArtifactEnum): string;
}
