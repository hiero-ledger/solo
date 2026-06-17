// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Hedera SDK transaction that solo submitted to a consensus node
 * receives a receipt whose status is not `SUCCESS`. The error message carries the operation
 * that failed and the raw network status code (for example
 * `node create transaction failed with status: INVALID_SIGNATURE`). This means the network
 * reached and rejected the transaction rather than failing to deliver it: common causes are a
 * node that has not yet reached ACTIVE during setup, staking, or a network upgrade; an
 * operator/admin key that does not match the account; or an address-book/state precondition
 * that the transaction violated. The specific status code identifies which.
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
