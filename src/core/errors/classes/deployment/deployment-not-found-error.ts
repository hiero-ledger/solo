// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a command resolves a deployment by name but that name is not
 * registered in the local configuration; the error message names the deployment that was
 * requested. solo looks the deployment up to find its namespace and cluster references
 * before acting, so the lookup fails when the `--deployment` value is misspelled, when the
 * deployment was never created with `solo deployment config create`, or when it was removed
 * by a prior delete. It can also surface after switching `SOLO_HOME` to a config that does
 * not contain the deployment.
 */
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
