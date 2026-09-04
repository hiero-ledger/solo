// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo deployment config create` cannot record a new deployment;
 * the underlying failure is wrapped in `cause`. Creating a deployment writes its entry to the
 * local configuration and provisions the associated namespace, so this is raised when that work
 * fails — for example the local config could not be written, or the Kubernetes API rejected or
 * could not create the namespace. It is retryable because a transient cluster or filesystem
 * issue often clears on a second attempt.
 */
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
