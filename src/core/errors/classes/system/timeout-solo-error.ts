// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an operation does not complete within its allotted time.
 * Solo uses timeouts when waiting for Kubernetes pods to become Ready, for Hedera
 * SDK calls to complete, or for long-running CLI steps. This error is retryable —
 * the same command can often succeed if the underlying resource eventually stabilises.
 */
export class TimeoutSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(message: string = 'Timeout') {
    super({
      message,
      code: ErrorCodeRegistry.TIMEOUT,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify the target resource or service is responding\n' +
        'Check Kubernetes pod status: kubectl get pods -A\n' +
        'Increase the timeout if the operation is expected to take longer',
    });
  }
}
