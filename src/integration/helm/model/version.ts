// SPDX-License-Identifier: Apache-2.0

import {SemanticVersion} from '../base/api/version/semantic-version.js';

/**
 * The response from the helm version command.
 */
export class Version {
  public constructor(public readonly version: string) {}

  /**
   * Returns a SemanticVersion representation of the version.
   * @returns the helm version
   */
  public asSemanticVersion(): SemanticVersion {
    let safeVersion: string = this.version.trim();

    if (safeVersion.startsWith('v')) {
      safeVersion = safeVersion.slice(1);
    }

    return SemanticVersion.parse(safeVersion);
  }
}
