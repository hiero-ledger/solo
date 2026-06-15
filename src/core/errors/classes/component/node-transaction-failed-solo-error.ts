// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Hedera SDK transaction sent to a consensus node is
 * rejected with a non-SUCCESS status code. The transaction type and the raw status
 * string are included in the error message. Common during node setup, staking
 * operations, or network upgrades when the node is not yet fully active.
 */
export class NodeTransactionFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(operation: string, status: string, cause?: Error) {
    super(
      {
        message: `${operation} transaction failed with status: ${status}`,
        code: ErrorCodeRegistry.NODE_TRANSACTION_FAILED,
        troubleshootingSteps:
          'Check the solo logs for details: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the node pod is running: kubectl get pods -n <namespace> -l solo.hedera.com/type=network-node\n' +
          'Consult the Hedera documentation for the meaning of the status code',
      },
      cause,
    );
  }
}
