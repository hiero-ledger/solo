// SPDX-License-Identifier: Apache-2.0

import {type CacheTargetStructure} from './cache-target-structure.js';

/**
 * Describes the health of a single cached target.
 */
export interface ArtifactHealthResultStructure {
  /**
   * Target that was checked.
   */
  readonly target: CacheTargetStructure;

  /**
   * Whether the cached target is considered healthy.
   */
  readonly healthy: boolean;

  /**
   * Optional human-readable message describing the result.
   *
   * Examples:
   * - "archive exists"
   * - "archive missing"
   * - "chart package is corrupted"
   */
  readonly message?: string;
}
