// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ClusterReferenceAlreadyExistsError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(clusterReference: string) {
    super({
      message: `Cluster ref ${clusterReference} is already added for deployment`,
      code: ErrorCodeRegistry.CLUSTER_REF_ALREADY_EXISTS,
      troubleshootingSteps:
        'List current cluster references: solo cluster-ref config list\nDisconnect it first if you want to re-add it: solo cluster-ref config disconnect --cluster-ref <name>',
    });
  }
}
