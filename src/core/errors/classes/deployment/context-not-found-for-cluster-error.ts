// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a cluster reference exists in the local configuration but has no
 * kubeconfig context bound to it; the message names the cluster reference. solo needs the
 * context to know which cluster the reference points at, so this is raised when the mapping is
 * missing — usually because the reference was recorded without being connected to a context, or
 * the binding was removed. Connect a kubeconfig context to the cluster reference before retrying.
 */
export class ContextNotFoundForClusterError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string, clusterReferenceFlagName: string, contextFlagName: string) {
    super({
      message: `Context not found for cluster reference ${clusterReference}`,
      code: ErrorCodeRegistry.CONTEXT_NOT_FOUND_FOR_CLUSTER,
      troubleshootingSteps: `Connect a kubeconfig context to the cluster: solo cluster-ref config connect ${clusterReferenceFlagName} <name> ${contextFlagName} <context>`,
    });
  }
}
