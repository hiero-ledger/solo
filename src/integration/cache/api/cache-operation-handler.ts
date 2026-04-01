// SPDX-License-Identifier: Apache-2.0

import {type CacheArtifactEnum} from '../enums/cache-artifact-enum.js';
import {type CacheTargetStructure} from '../models/cache-target-structure.js';
import {type CachedItemStructure} from '../models/cached-item-structure.js';
import {type ArtifactHealthResultStructure} from '../models/artifact-health-result-structure.js';

/**
 * Strategy contract for handling one cache domain.
 *
 * Implementations encapsulate the full behavior for a specific artifact type,
 * for example:
 * - container images
 * - Helm charts
 *
 * This keeps domain-specific behavior out of the coordinator.
 */
export interface CacheOperationHandler {
  /**
   * Returns the artifact type handled by this strategy.
   */
  getType(): CacheArtifactEnum;

  /**
   * Pulls and stores the provided targets into the local cache.
   *
   * Implementations are responsible for:
   * - fetching the target from its source
   * - writing the local cached artifact
   * - returning the resulting cached items
   */
  pull(targets: readonly CacheTargetStructure[]): Promise<readonly CachedItemStructure[]>;

  /**
   * Loads cached items into their runtime or consumption environment.
   *
   * Examples:
   * - Docker images loaded into the local engine and optionally into a Kind cluster
   * - Helm charts prepared for downstream usage
   *
   * @param items cached items to load
   * @param target optional runtime target, such as a cluster name
   */
  load(items: readonly CachedItemStructure[], target?: string): Promise<void>;

  /**
   * Deletes cached items for this domain.
   *
   * Implementations should remove local cached files and any domain-specific
   * local runtime state when appropriate.
   */
  clear(items: readonly CachedItemStructure[]): Promise<void>;

  /**
   * Performs a health check for the provided cached items.
   *
   * Implementations should validate that each cached item is still usable.
   */
  healthcheck(items: readonly CachedItemStructure[]): Promise<readonly ArtifactHealthResultStructure[]>;

  /**
   *
   */
  resolveRequiredArtifacts(): Promise<readonly CacheTargetStructure[]>;
}
