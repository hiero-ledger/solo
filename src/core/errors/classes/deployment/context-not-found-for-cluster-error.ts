// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ClusterReferenceCommandDefinition} from '../../../../commands/command-definitions/cluster-reference-command-definition.js';

export class ContextNotFoundForClusterError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string) {
    super({
      message: `Context not found for cluster reference ${clusterReference}`,
      code: ErrorCodeRegistry.CONTEXT_NOT_FOUND_FOR_CLUSTER,
      troubleshootingSteps: `Connect a kubeconfig context to the cluster: solo ${ClusterReferenceCommandDefinition.CONNECT_COMMAND} ${Flags.getFormattedFlagKey(Flags.clusterRef)} <name> ${Flags.getFormattedFlagKey(Flags.context)} <context>`,
    });
  }
}
