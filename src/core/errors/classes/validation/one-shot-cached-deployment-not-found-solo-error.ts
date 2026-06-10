// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class OneShotCachedDeploymentNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(hint: string) {
    super({
      message: hint,
      code: ErrorCodeRegistry.ONE_SHOT_CACHED_DEPLOYMENT_NOT_FOUND,
      troubleshootingSteps:
        'List available deployments: solo deployment config list\n' +
        'Specify the deployment explicitly with --deployment) <name>',
    });
  }
}
