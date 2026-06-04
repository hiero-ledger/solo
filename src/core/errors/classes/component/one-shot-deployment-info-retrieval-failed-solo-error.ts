// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class OneShotDeploymentInfoRetrievalFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error retrieving deployment information: ${cause.message}`,
        code: ErrorCodeRegistry.ONE_SHOT_DEPLOYMENT_INFO_RETRIEVAL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify kubeconfig context is valid: kubectl cluster-info',
      },
      cause,
    );
  }
}
