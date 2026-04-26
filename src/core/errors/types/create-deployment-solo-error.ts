// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';

export class CreateDeploymentSoloError extends SoloError {
  public constructor(cause?: Error) {
    super(
      {
        messageKey: 'create_deployment_error_message',
        code: ErrorCodeRegistry.CREATE_DEPLOYMENT,
        troubleshootingKey: 'create_deployment_troubleshooting_steps',
      },
      cause,
    );
  }
}
