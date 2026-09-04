// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a cluster reference that is already attached to the deployment is
 * added again; the message names the duplicate reference. solo keeps each cluster reference
 * attached to a deployment at most once, so it rejects a second add rather than creating a
 * conflicting duplicate entry. If you intend to re-add it (for example to change its binding),
 * disconnect it first and then connect it again.
 */
export class ClusterReferenceAlreadyExistsError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string, clusterReferenceFlagName: string) {
    super({
      message: `Cluster ref ${clusterReference} is already added for deployment`,
      code: ErrorCodeRegistry.CLUSTER_REF_ALREADY_EXISTS,
      troubleshootingSteps:
        'List current cluster references: solo cluster-ref config list\n' +
        `Disconnect it first if you want to re-add it: solo cluster-ref config disconnect ${clusterReferenceFlagName} <cluster-reference>`,
    });
  }
}
