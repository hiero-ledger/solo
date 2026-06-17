// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {type DeploymentName} from '../../../../types/index.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo deployment config create` is asked to create a deployment
 * whose name is already present in the local configuration; the message names the conflicting
 * deployment. Deployment names must be unique because solo keys each deployment's namespace and
 * cluster references by name, so it refuses to overwrite an existing entry. Choose a different
 * name, or operate on the existing deployment instead of recreating it.
 */
export class DeploymentAlreadyExistsSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deploymentName: DeploymentName, cause?: Error) {
    super(
      {
        message: `A deployment named '${deploymentName}' already exists. Please select a different name`,
        code: ErrorCodeRegistry.DEPLOYMENT_NAME_ALREADY_EXISTS,
        troubleshootingSteps:
          'Check existing deployments: solo deployment config list\n' + 'Choose a different name for your deployment',
      },
      cause,
    );
  }
}
