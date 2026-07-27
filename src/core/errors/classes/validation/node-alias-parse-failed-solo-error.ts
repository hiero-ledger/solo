// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot parse a node alias from input; the message includes the offending value. solo
 * parses node aliases from flags and config, so this means the value could not be parsed as an alias.
 */
export class NodeAliasParseFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(data: string) {
    super({
      message: `Cannot parse node alias from: ${data}`,
      code: ErrorCodeRegistry.NODE_ALIAS_PARSE_FAILED,
      troubleshootingSteps:
        'Verify the node alias format (expected: node<N> where N is a positive integer)\n' +
        'Check deployment configuration for valid node aliases: solo deployment config info',
    });
  }
}
