// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the node-create transaction fails to execute; when available the underlying failure is
 * wrapped in `cause`. solo submits a node-create transaction to add a consensus node to the network's
 * address book, so this means the transaction was rejected or could not be submitted — for example the
 * admin key did not sign, the node endpoints or parameters were invalid, or the network could not be
 * reached.
 */
export class NodeCreateTransactionErrorSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: `Failed to execute node create transaction${cause?.message ? `: ${cause.message}` : ''}`,
        code: ErrorCodeRegistry.NODE_CREATE_TRANSACTION_ERROR,
        troubleshootingSteps:
          'Verify gossip endpoints and gRPC service endpoints are reachable from the network.\n' +
          'Confirm the admin key is valid and the account has sufficient HBAR.\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
