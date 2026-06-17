// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo block node add` cannot deploy a block node; the underlying failure is wrapped in
 * `cause`. Deploy installs the block node Helm release, so this means that install did not succeed — for
 * example a Helm failure, an image that cannot be pulled, misconfigured values, or insufficient cluster
 * resources.
 */
export class BlockNodeDeployFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error deploying block node: ${cause.message}`,
        code: ErrorCodeRegistry.BLOCK_NODE_DEPLOY_FAILED,
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
