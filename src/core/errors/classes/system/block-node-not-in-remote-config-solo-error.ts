// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
