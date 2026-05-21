// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NoDeploymentsFoundError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'No deployments found in local config',
      code: ErrorCodeRegistry.NO_DEPLOYMENTS_FOUND,
      troubleshootingSteps: 'Create a deployment: solo deployment config create',
    });
  }
}
