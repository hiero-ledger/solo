// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the node-delete transaction fails to execute; when available the underlying failure is
 * wrapped in `cause`. solo submits a node-delete transaction to remove a consensus node from the address
 * book, so this means the transaction was rejected or could not be submitted — for example the admin key
 * did not sign, the target node id was invalid, or the network could not be reached.
 */
export class NodeDeleteTransactionErrorSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: `Failed to execute node delete transaction${cause?.message ? `: ${cause.message}` : ''}`,
        code: ErrorCodeRegistry.NODE_DELETE_TRANSACTION_ERROR,
        troubleshootingSteps:
          'Verify the node admin key is correct and loaded from the k8s secret.\n' +
          'Confirm the node exists in the current address book.\n' +
          'Verify gossip endpoints and gRPC service endpoints are reachable from the network.\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
