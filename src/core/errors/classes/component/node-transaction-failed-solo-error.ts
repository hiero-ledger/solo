// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeTransactionFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(operation: string, status: string, cause?: Error) {
    super(
      {
        message: `${operation} transaction failed with status: ${status}`,
        code: ErrorCodeRegistry.NODE_TRANSACTION_FAILED,
        troubleshootingSteps:
          'Check the node logs: tail -f ~/.solo/logs/solo.log | jq\nVerify network health: kubectl get pods -n <namespace>\nInspect the transaction receipt status in the Hedera documentation',
      },
      cause,
    );
  }
}
