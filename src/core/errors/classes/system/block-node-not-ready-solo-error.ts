// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a deployed block node does not become ready; the message names the release and wraps the
 * underlying failure in `cause`. solo waits for the block node pods to reach a Ready state, so this means
 * that wait did not succeed. It is retryable, since a block node that is merely slow to start often becomes
 * ready on a later attempt; a persistent failure points to a crash-looping or misconfigured block node.
 */
export class BlockNodeNotReadySoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(releaseName: string, cause: Error) {
    super(
      {
        message: `Block node ${releaseName} is not ready: ${cause.message}`,
        code: ErrorCodeRegistry.BLOCK_NODE_NOT_READY,
        troubleshootingSteps:
          `Check block node pod status: kubectl get pods -A | grep ${releaseName}\n` +
          `Describe pods for readiness probe failures: kubectl describe pods -A -l app.kubernetes.io/instance=${releaseName}\n` +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
