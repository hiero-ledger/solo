// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {type DeploymentName} from '../../../types/index.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';
import {LocaleRegistry} from '../../locales/locale-registry.js';

export class DeploymentAlreadyExistsSoloError extends SoloError {
  protected override readonly code: string = ErrorCodeRegistry.DEPLOYMENT_NAME_ALREADY_EXISTS;
  protected override readonly messageKey: string = 'deployment_already_exists_message';
  protected override readonly troubleshootingKey: string = 'deployment_already_exists_troubleshooting_steps';

  public constructor(deploymentName: DeploymentName, cause?: Error) {
    super(LocaleRegistry.getMessage('deployment_already_exists_message', {deploymentName}), cause);
  }
}
