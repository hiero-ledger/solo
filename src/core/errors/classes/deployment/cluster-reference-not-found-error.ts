// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';

export class ClusterReferenceNotFoundError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string) {
    super({
      message: `Cluster ref ${clusterReference} not found in local config`,
      code: ErrorCodeRegistry.CLUSTER_REF_NOT_FOUND,
      troubleshootingSteps:
        'List available cluster references: solo cluster-ref config list\n' +
        `Connect a cluster: solo cluster-ref config connect ${Flags.getFormattedFlagKey(Flags.clusterRef)} <cluster-reference> ${Flags.getFormattedFlagKey(Flags.context)} <context>`,
    });
  }
}
