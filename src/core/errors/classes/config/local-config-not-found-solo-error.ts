// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot locate the local configuration file at its expected
 * path (`~/.solo/local-config.yaml`). This typically happens on first run before
 * `solo init` has been executed, or if the file was manually deleted or moved.
 */
export class LocalConfigNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Local configuration file not found',
        code: ErrorCodeRegistry.LOCAL_CONFIG_NOT_FOUND,
        troubleshootingSteps:
          'Create a local config: solo deployment config create --deployment <deployment-name> --namespace <namespace>',
      },
      cause,
    );
  }
}
