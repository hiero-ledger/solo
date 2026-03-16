// SPDX-License-Identifier: Apache-2.0

/**
 * A client interface for interacting with the git command-line tool.
 */
export interface GitClient {
  /**
   * Returns the version string reported by git.
   *
   * @returns the output of `git version`.
   * @throws an error if git is not available.
   */
  version(): Promise<string>;

  /**
   * Returns the most recent tag reachable from HEAD in the given directory.
   * Equivalent to running `git -C <directory> describe --tags --abbrev=0`.
   *
   * @param directory the path to the git repository.
   * @returns the tag string.
   * @throws an error if no tag is found or git fails.
   */
  describeTag(directory: string): Promise<string>;
}
