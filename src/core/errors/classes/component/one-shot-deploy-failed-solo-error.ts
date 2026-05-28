// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class OneShotDeployFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(message: string, cause: Error) {
    super(
      {
        message,
        code: ErrorCodeRegistry.ONE_SHOT_DEPLOY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'If rollback was skipped, clean up partial resources: solo one-shot single destroy',
      },
      cause,
    );
  }
}
