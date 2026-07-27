// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot resolve a node ID from a node alias; the message names the alias. solo maps
 * aliases to node IDs, so this means the alias is not recognized — for example a typo or an alias not
 * present in the deployment.
 */
export class UnknownNodeAliasSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(nodeAlias: string) {
    super({
      message: `Cannot get node ID from node alias '${nodeAlias}'`,
      code: ErrorCodeRegistry.UNKNOWN_NODE_ALIAS,
      troubleshootingSteps:
        `Verify the node alias '${nodeAlias}' is registered in the current deployment\n` +
        'Check registered nodes: solo deployment config info',
    });
  }
}
