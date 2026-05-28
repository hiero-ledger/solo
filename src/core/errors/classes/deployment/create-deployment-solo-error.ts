// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class CreateDeploymentSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error creating deployment',
        code: ErrorCodeRegistry.CREATE_DEPLOYMENT,
        troubleshootingSteps: 'Check the logs for details: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
