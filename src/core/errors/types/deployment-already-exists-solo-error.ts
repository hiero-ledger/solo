// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {type DeploymentName} from '../../../types/index.js';
import {SoloErrorCode} from '../solo-error-code.js';

export class DeploymentAlreadyExistsSoloError extends SoloError {
  public constructor(deploymentName: DeploymentName, cause?: Error) {
    super(...SoloError.resolveCodeArgs(SoloErrorCode.DEPLOYMENT_NAME_ALREADY_EXISTS, {deploymentName}, cause));
  }
}
