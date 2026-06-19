// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot resolve which cluster reference a deployment should use;
 * the message names the deployment. Internally a command expected the deployment to yield a
 * single, unambiguous cluster reference (so it knows where to act) but the resolution returned
 * nothing usable. While an unattached deployment is the visible trigger, this is classified as
 * a Solo-owned error because the calling code should have ensured a cluster was attached before
 * reaching this point — it points to a missing precondition in solo's flow.
 */
export class ClusterReferenceResolutionFailedError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(
    deployment: string,
    deploymentFlagName: string,
    numberOfCNFlagName: string,
    clusterReferenceFlagName: string,
  ) {
    super({
      message: `Failed to get cluster reference for deployment ${deployment}`,
      code: ErrorCodeRegistry.CLUSTER_REFERENCE_RESOLUTION_FAILED,
      troubleshootingSteps:
        `Verify the deployment has clusters attached: solo deployment config info ${deploymentFlagName} <name>\n` +
        `Attach the cluster reference to the deployment: solo deployment cluster attach ${deploymentFlagName} <name>` +
        ` ${clusterReferenceFlagName} <cluster-reference> ${numberOfCNFlagName} <number>`,
    });
  }
}
