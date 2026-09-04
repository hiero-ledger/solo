// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a deployment is deleted while it still has live components running
 * in one of its clusters; the message names the deployment and the `clusterReference` where
 * resources remain. Before removing a deployment's local entry, solo checks each attached
 * cluster and refuses to proceed if it still hosts components (mirror node, relay, explorer,
 * block node, or the consensus network), since deleting the entry would orphan those running
 * workloads. Destroy the components first, then delete the deployment.
 */
export class DeploymentHasRemoteResourcesError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deployment: string, clusterReference: string, deploymentFlagName: string) {
    super({
      message: `Deployment ${deployment} has remote resources in cluster: ${clusterReference}`,
      code: ErrorCodeRegistry.DEPLOYMENT_HAS_REMOTE_RESOURCES,
      troubleshootingSteps:
        'Destroy all components in the deployment before deleting it:\n' +
        `solo mirror node destroy ${deploymentFlagName} <name>\n` +
        `solo relay node destroy ${deploymentFlagName} <name>\n` +
        `solo explorer node destroy ${deploymentFlagName} <name>\n` +
        `solo block node destroy ${deploymentFlagName} <name>\n` +
        `solo consensus network destroy ${deploymentFlagName} <name>`,
    });
  }
}
