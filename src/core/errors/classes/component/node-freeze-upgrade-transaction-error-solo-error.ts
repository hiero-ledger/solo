// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a freeze-upgrade transaction fails to execute; when available the underlying failure is
 * wrapped in `cause`. solo submits this transaction to freeze the network in preparation for a software
 * upgrade, so this means it was rejected or could not be submitted — for example the prepared upgrade was
 * not staged, the admin key did not sign, or the network could not be reached. It is retryable.
 */
export class NodeFreezeUpgradeTransactionErrorSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: `Failed to execute freeze upgrade transaction${cause?.message ? `: ${cause.message}` : ''}`,
        code: ErrorCodeRegistry.NODE_FREEZE_UPGRADE_TRANSACTION_ERROR,
        troubleshootingSteps:
          'Verify the node admin key is correct and loaded from the k8s secret.\n' +
          'Confirm the freeze admin account has sufficient HBAR balance.\n' +
          'Verify the nodes have completed the prepare upgrade step.\n' +
          'Verify gossip endpoints and gRPC service endpoints are reachable from the network.\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
