// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no JSON-RPC relay is present in the deployment remote configuration. solo looks the relay up
 * in the remote config before acting on it, so this means none is recorded — typically because it was never
 * deployed for this deployment, or was already removed.
 */
export class RelayNotInRemoteConfigSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Relay not found in remote config',
      code: ErrorCodeRegistry.RELAY_NOT_IN_REMOTE_CONFIG,
      troubleshootingSteps:
        'List components in remote config: solo deployment config info\n' + 'Deploy the relay first: solo relay deploy',
    });
  }
}
