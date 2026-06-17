// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
