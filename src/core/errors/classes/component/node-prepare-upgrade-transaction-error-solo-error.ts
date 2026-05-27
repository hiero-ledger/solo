// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
