// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ClusterReferenceCommandDefinition} from '../../../../commands/command-definitions/cluster-reference-command-definition.js';

export class ClusterReferenceAlreadyExistsError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string) {
    super({
      message: `Cluster ref ${clusterReference} is already added for deployment`,
      code: ErrorCodeRegistry.CLUSTER_REF_ALREADY_EXISTS,
      troubleshootingSteps:
        `List current cluster references: solo ${ClusterReferenceCommandDefinition.LIST_COMMAND}\n` +
        `Disconnect it first if you want to re-add it: solo ${ClusterReferenceCommandDefinition.DISCONNECT_COMMAND} ${Flags.getFormattedFlagKey(Flags.clusterRef)} <cluster-reference>`,
    });
  }
}
