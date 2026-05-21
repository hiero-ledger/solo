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
          'Check node connectivity: kubectl get pods -n <namespace>\nReview solo logs: tail -f ~/.solo/logs/solo.log | jq\nRetry the operation after verifying cluster health: kubectl get nodes',
      },
      cause,
    );
  }
}
