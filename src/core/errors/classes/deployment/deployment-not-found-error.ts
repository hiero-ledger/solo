// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DeploymentNotFoundError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(message: string, cause?: Error) {
    super(
      {
        message,
        code: ErrorCodeRegistry.DEPLOYMENT_NOT_FOUND,
        troubleshootingSteps:
          'List available deployments: solo deployment config list\n' +
          'Create a deployment if needed: solo deployment config create',
      },
      cause,
    );
  }
}
