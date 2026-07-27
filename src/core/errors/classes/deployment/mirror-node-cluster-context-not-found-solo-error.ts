// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo needs to act on a mirror node but cannot determine which cluster
 * (kubeconfig context) it lives in; the message names the `mirrorNodeId`. solo maps each mirror
 * node to a registered cluster reference to find the context for its operations, so this is
 * raised when no such mapping resolves — typically because the mirror node is not associated
 * with a registered cluster reference, or the referenced cluster is missing from the deployment
 * configuration.
 */
export class MirrorNodeClusterContextNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(mirrorNodeId: string) {
    super({
      message: `No cluster context found for mirror node ${mirrorNodeId}`,
      code: ErrorCodeRegistry.MIRROR_NODE_CLUSTER_CONTEXT_NOT_FOUND,
      troubleshootingSteps:
        'List registered cluster references: solo cluster-ref config list\n' +
        'Verify the mirror node is associated with a registered cluster\n' +
        'Check deployment configuration: solo deployment config info',
    });
  }
}
