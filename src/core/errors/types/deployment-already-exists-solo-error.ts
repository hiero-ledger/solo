// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {type DeploymentName} from '../../../types/index.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';

export class DeploymentAlreadyExistsSoloError extends SoloError {
  public constructor(deploymentName: DeploymentName, cause?: Error) {
    super(
      {
        messageKey: 'deployment_already_exists_message',
        code: ErrorCodeRegistry.DEPLOYMENT_NAME_ALREADY_EXISTS,
        troubleshootingKey: 'deployment_already_exists_troubleshooting_steps',
        context: {deploymentName},
      },
      cause,
    );
  }
}
