// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo deployment config list` cannot enumerate the configured
 * deployments; the underlying failure is wrapped in `cause`. Listing reads the deployment
 * entries from the local configuration and may consult the clusters they reference, so this is
 * raised when that read fails — for example the local config could not be read or parsed, or a
 * referenced cluster could not be queried. It is retryable because transient filesystem or
 * cluster issues often resolve on a later attempt.
 */
export class DeploymentListFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error listing deployments',
        code: ErrorCodeRegistry.DEPLOYMENT_LIST_FAILED,
        troubleshootingSteps: 'Check logs for details: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
