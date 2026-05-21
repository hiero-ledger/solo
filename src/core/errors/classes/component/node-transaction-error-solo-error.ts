// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeTransactionErrorSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(operation: string, cause: Error) {
    super(
      {
        message: `Error in ${operation}: ${cause.message}`,
        code: ErrorCodeRegistry.NODE_TRANSACTION_ERROR,
        troubleshootingSteps:
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Check the node pod status: kubectl get pods -n <namespace> -l solo.hedera.com/type=network-node\n' +
          'Verify the cluster is reachable: kubectl cluster-info --context <context>',
      },
      cause,
    );
  }
}
