// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a block node health check does not pass; the message states the reason. solo health-checks a
 * block node to confirm it is up and serving before relying on it, so this means the check reported the
 * node unhealthy or could not reach it. It is retryable, since a block node that is still starting often
 * passes on a later attempt.
 */
export class BlockNodeHealthCheckFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(reason: string) {
    super({
      message: `Block node health check failed: ${reason}`,
      code: ErrorCodeRegistry.BLOCK_NODE_HEALTH_CHECK_FAILED,
      troubleshootingSteps:
        'Check block node pod status: kubectl get pods -A -l block-node.hiero.com/type=block-node\n' +
        'Verify liveness endpoint manually: kubectl exec -n <namespace> <pod> -- curl http://localhost:<port>/healthz/readyz\n' +
        'Check pod logs: kubectl logs -n <namespace> -l block-node.hiero.com/type=block-node\n' +
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
