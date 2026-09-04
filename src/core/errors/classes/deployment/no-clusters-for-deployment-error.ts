// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an operation targets a deployment that has no clusters attached; the
 * message names the deployment. A deployment must have at least one cluster reference attached
 * before solo can place or manage its components, so this is raised when the deployment exists
 * but its cluster list is empty — typically because `solo deployment cluster attach` has not yet
 * been run for it. Attach a cluster to the deployment before retrying.
 */
export class NoClustersForDeploymentError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deployment: string) {
    super({
      message: `No clusters found for deployment ${deployment}`,
      code: ErrorCodeRegistry.NO_CLUSTERS_FOR_DEPLOYMENT,
      troubleshootingSteps: 'Attach a cluster to the deployment: solo deployment cluster attach --deployment <name>',
    });
  }
}
