// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DeploymentHasRemoteResourcesError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deployment: string, clusterReference: string) {
    super({
      message: `Deployment ${deployment} has remote resources in cluster: ${clusterReference}`,
      code: ErrorCodeRegistry.DEPLOYMENT_HAS_REMOTE_RESOURCES,
      troubleshootingSteps:
        'Destroy all components in the deployment before deleting it:\n' +
        'solo mirror node destroy --deployment <name>\n' +
        'solo relay node destroy --deployment <name>\n' +
        'solo explorer node destroy --deployment <name>\n' +
        'solo block node destroy --deployment <name>\n' +
        'solo consensus network destroy --deployment <name>',
    });
  }
}
