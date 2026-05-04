// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';

export class CreateDeploymentSoloError extends SoloError {
  public constructor(cause?: Error) {
    super(
      {
        localeKey: 'create_deployment_error',
        code: ErrorCodeRegistry.CREATE_DEPLOYMENT,
      },
      cause,
    );
  }
}
