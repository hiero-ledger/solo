// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class MultipleDeploymentsFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(source: 'remote' | 'local', deploymentNames: string) {
    super({
      message: `Multiple deployments found in ${source} config (${deploymentNames}). Please provide --deployment`,
      code: ErrorCodeRegistry.MULTIPLE_DEPLOYMENTS_FOUND,
      troubleshootingSteps:
        'List existing deployments: solo deployment config list\n' +
        'Specify the deployment explicitly: solo node <command> --deployment <name>',
    });
  }
}
