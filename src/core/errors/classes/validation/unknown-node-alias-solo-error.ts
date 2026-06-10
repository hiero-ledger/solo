// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
