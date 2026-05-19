// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {ErrorOwnership} from '../error-ownership.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';

export class CreateDeploymentSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error creating deployment',
        code: ErrorCodeRegistry.CREATE_DEPLOYMENT,
        troubleshootingSteps:
          'Make sure if the deployment is already created: solo deployment config list\n' +
          'Check the logs for details: tail -f ~/.solo/logs/solo.log\n' +
          'Review your configuration: solo deployment config info',
      },
      cause,
    );
  }
}
