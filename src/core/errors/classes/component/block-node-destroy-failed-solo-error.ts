// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo block node destroy` cannot tear down a block node; the underlying failure is wrapped in
 * `cause`. Destroy uninstalls the block node Helm release and removes its resources, so this means teardown
 * did not complete — for example a Helm release could not be removed or the cluster API was unreachable.
 */
export class BlockNodeDestroyFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error destroying block node: ${cause.message}`,
        code: ErrorCodeRegistry.BLOCK_NODE_DESTROY_FAILED,
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
