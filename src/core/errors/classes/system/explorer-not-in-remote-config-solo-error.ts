// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no Hiero Explorer component is present in the deployment remote configuration. solo looks the
 * explorer up in the remote config before acting on it, so this means none is recorded — typically because
 * the explorer was never deployed for this deployment, or was already removed.
 */
export class ExplorerNotInRemoteConfigSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'No explorer component found in remote config',
      code: ErrorCodeRegistry.EXPLORER_NOT_IN_REMOTE_CONFIG,
      troubleshootingSteps:
        'List components in remote config: solo deployment config info\n' +
        'Deploy the explorer first: solo explorer deploy',
    });
  }
}
