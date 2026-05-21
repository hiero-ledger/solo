// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DeploymentNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(flagName: string) {
    super({
      message: `No deployments found in local or remote config. Please provide --${flagName} or create a deployment first`,
      code: ErrorCodeRegistry.DEPLOYMENT_NOT_FOUND,
      troubleshootingSteps:
        'List existing deployments: solo deployment config list\n' +
        'Create a new deployment: solo deployment config create\n' +
        'Provide the deployment explicitly: solo node <command> --deployment <name>',
    });
  }
}
