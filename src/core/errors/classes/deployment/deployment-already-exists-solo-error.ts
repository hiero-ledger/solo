// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {type DeploymentName} from '../../../../types/index.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DeploymentAlreadyExistsSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deploymentName: DeploymentName, cause?: Error) {
    super(
      {
        message: `A deployment named '${deploymentName}' already exists. Please select a different name`,
        code: ErrorCodeRegistry.DEPLOYMENT_NAME_ALREADY_EXISTS,
        troubleshootingSteps:
          'Check existing deployments: solo deployment config list\nChoose a different name for your deployment',
      },
      cause,
    );
  }
}
