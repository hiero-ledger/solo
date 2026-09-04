// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a command refers to a cluster reference that is not registered in
 * the local configuration; the message names the missing reference. A cluster reference is the
 * named link between solo and a kubeconfig context, created with `solo cluster-ref config
 * connect`, so this is raised when the supplied name was never connected, was misspelled, or was
 * disconnected. Connect the cluster reference (or correct the name) before retrying.
 */
export class ClusterReferenceNotFoundError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string, clusterReferenceFlagName: string, contextFlagName: string) {
    super({
      message: `Cluster ref ${clusterReference} not found in local config`,
      code: ErrorCodeRegistry.CLUSTER_REF_NOT_FOUND,
      troubleshootingSteps:
        'List available cluster references: solo cluster-ref config list\n' +
        `Connect a cluster: solo cluster-ref config connect ${clusterReferenceFlagName} <cluster-reference> ${contextFlagName} <context>`,
    });
  }
}
