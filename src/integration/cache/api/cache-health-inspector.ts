// SPDX-License-Identifier: Apache-2.0

/**
 * Filesystem-oriented inspection contract for cache validation.
 *
 * This interface isolates raw IO checks from higher-level domain logic.
 */
export interface CacheHealthInspector {
  /**
   * Returns whether the given path exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Returns the size of the given path in bytes.
   */
  getSize(path: string): Promise<number>;

  /**
   * Filters the provided paths to only those that exist.
   */
  filterExisting(paths: readonly string[]): Promise<readonly string[]>;
}
