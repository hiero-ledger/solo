// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Deliberately thrown by solo's fault-injection hook to exercise failure and
 * recovery paths during testing — it does not represent a genuine problem with your network or
 * environment. When the `SOLO_FAIL_AFTER_STEP` environment variable is set, the orchestrator
 * compares it against each step title and raises this error immediately after the matching
 * step completes; the message names that step. If you encounter it without intending to test
 * fault handling, it means `SOLO_FAIL_AFTER_STEP` is set in your environment — unset it to stop
 * the injected failure.
 */
export class InjectedFailureSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(stepTitle: string) {
    super({
      message: `[TEST] Injected failure after step '${stepTitle}'`,
      code: ErrorCodeRegistry.INJECTED_FAILURE,
      troubleshootingSteps:
        'This error is intended for testing purposes.\n' +
        'If you did not expect to see this error unset your environment variable: SOLO_FAIL_AFTER_STEP',
    });
  }
}
