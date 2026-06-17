// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot remove an external block node from the deployment; the underlying failure is
 * wrapped in `cause`. Removing an external block node updates the configuration so consensus nodes no
 * longer use it, so this means that removal step failed — for example the remote configuration could not be
 * updated.
 */
export class BlockNodeDeleteExternalFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error removing external block node: ${cause.message}`,
        code: ErrorCodeRegistry.BLOCK_NODE_DELETE_EXTERNAL_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect the remote config for the registered node: solo deployment config info\n' +
          'Inspect block node pods: kubectl get pods -A -l block-node.hiero.com/type=block-node\n' +
          'If the issue persists, report it with your solo log',
      },
      cause,
    );
  }
}
