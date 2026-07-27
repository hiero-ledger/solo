// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a bounded operation does not finish within the time solo allows
 * for it. solo guards long-running waits with deadlines — most often while polling for a
 * Kubernetes pod or service to become Ready, but also for Hedera SDK calls and other
 * long-running CLI steps — and raises this once the deadline passes without the expected
 * condition being met. It signals that the operation was still in progress (or stuck), not
 * that it definitively failed, which is why it is retryable: a resource that is merely slow to
 * stabilise often succeeds on a later run or with a larger timeout. It is the base error for
 * more specific timeouts such as `PodTerminationTimeoutSoloError` and
 * `ClusterApiServerTimeoutSoloError`.
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
