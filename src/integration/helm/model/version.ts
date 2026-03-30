// SPDX-License-Identifier: Apache-2.0

import {SemanticVersion} from '../../../business/utils/semantic-version.js';

/**
 * The response from the helm version command.
 */
export class Version {
  public constructor(public readonly version: string) {}

  /**
   * Returns a SemanticVersion representation of the version.
   * @returns the helm version
   */
  public asSemanticVersion(): SemanticVersion<string> {
    return new SemanticVersion<string>(this.version);
  }
}
