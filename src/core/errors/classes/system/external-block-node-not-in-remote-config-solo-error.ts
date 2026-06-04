// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ExternalBlockNodeNotInRemoteConfigSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(id?: number) {
    super({
      message: `External block node${id === undefined ? '' : ` with ID ${id}`} was not found in remote config`,
      code: ErrorCodeRegistry.EXTERNAL_BLOCK_NODE_NOT_IN_REMOTE_CONFIG,
      troubleshootingSteps:
        'Register the external block node first: solo block node add-external\n' +
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
