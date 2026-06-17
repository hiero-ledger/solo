// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a referenced external block node is not present in the deployment remote configuration; when
 * provided, the message includes its id. solo looks external block nodes up in the remote config before
 * acting on them, so this means the id does not match any recorded external block node — typically because
 * it was never added or the wrong id was supplied.
 */
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
