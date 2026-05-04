// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {type DeploymentName} from '../../../types/index.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';

export class DeploymentAlreadyExistsSoloError extends SoloError {
  public constructor(deploymentName: DeploymentName, cause?: Error) {
    super(
      {
        localeKey: 'deployment_already_exists',
        code: ErrorCodeRegistry.DEPLOYMENT_NAME_ALREADY_EXISTS,
        context: {deploymentName},
      },
      cause,
    );
  }
}
