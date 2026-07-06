// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a referenced block node is not present in the deployment remote configuration; when provided,
 * the message includes its identifier. solo looks components up in the remote config before acting on them,
 * so this means the block node id does not match any recorded component — typically because it was never
 * added, was already removed, or the wrong id was supplied.
 */
export class BlockNodeNotInRemoteConfigSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(identifier?: string | number, cause?: Error) {
    super(
      {
        message: `Block node${identifier === undefined ? '' : ` ${identifier}`} was not found in remote config`,
        code: ErrorCodeRegistry.BLOCK_NODE_NOT_IN_REMOTE_CONFIG,
        troubleshootingSteps:
          'List all registered components: solo deployment config info\n' +
          'Verify you are targeting the correct deployment and namespace\n' +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
