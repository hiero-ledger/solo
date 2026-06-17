// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the prepare-upgrade transaction fails to execute; when available the underlying failure is
 * wrapped in `cause`. This transaction stages the upgrade artifacts on the network before a freeze-upgrade,
 * so this means staging was rejected or could not be submitted — for example the upgrade file was not
 * present or valid, or the network could not be reached. It is retryable.
 */
export class NodePrepareUpgradeTransactionErrorSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: `Failed to execute prepare upgrade transaction${cause?.message ? `: ${cause.message}` : ''}`,
        code: ErrorCodeRegistry.NODE_PREPARE_UPGRADE_TRANSACTION_ERROR,
        troubleshootingSteps:
          'Verify the node admin key is correct and loaded from the k8s secret.\n' +
          'Confirm the freeze admin account has sufficient HBAR balance.\n' +
          'Verify the upgrade zip file hash is correct.\n' +
          'Check node client connection to the consensus network.\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
