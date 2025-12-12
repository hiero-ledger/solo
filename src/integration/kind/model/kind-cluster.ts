// SPDX-License-Identifier: Apache-2.0

/**
 * The response from the kind cluster commands.
 */
export class KindCluster {
  /**
   * Constructs a new Repository.
   *
   * @param name the name of the repository.
   * @throws Error if any of the arguments are null or blank.
   */
  public constructor(public readonly name: string) {
    if (!name) {
      throw new Error('name must not be null');
    }

    if (!name.trim()) {
      throw new Error('name must not be blank');
    }
  }
}
