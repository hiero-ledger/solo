// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ClusterAddFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(clusterReferenceFlagKey: string, contextFlagKey: string, cause?: Error) {
    super(
      {
        message: 'Error adding cluster to deployment',
        code: ErrorCodeRegistry.CLUSTER_ADD_FAILED,
        troubleshootingSteps:
          'Verify the cluster context exists: kubectl config get-contexts\n' +
          `Make sure the cluster reference is created: cluster-ref config connect ${clusterReferenceFlagKey} <cluster-reference> ${contextFlagKey} <context>\n` +
          'Check logs for details: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
