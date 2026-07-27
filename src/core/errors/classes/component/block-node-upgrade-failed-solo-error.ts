// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo block node upgrade` cannot upgrade a block node; the underlying failure is wrapped in
 * `cause`. Upgrade re-applies the block node Helm release at a new chart or version, so this means the
 * upgrade did not succeed — for example a Helm failure, an image that cannot be pulled, or misconfigured
 * values.
 */
export class BlockNodeUpgradeFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error upgrading block node: ${cause.message}`,
        code: ErrorCodeRegistry.BLOCK_NODE_UPGRADE_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect block node pods: kubectl get pods -A -l block-node.hiero.com/type=block-node\n' +
          'Inspect Helm release: helm status <release> -n <namespace>\n' +
          'Check Helm history: helm history <release> -n <namespace>',
      },
      cause,
    );
  }
}
