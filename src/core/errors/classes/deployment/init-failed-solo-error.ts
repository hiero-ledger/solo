// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class InitFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: cause ? `Solo init failed: ${cause.message}` : 'Solo init failed',
        code: ErrorCodeRegistry.INIT_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify all prerequisites are installed (kubectl, helm, kind, docker)\n' +
          'Re-run initialization: solo init',
      },
      cause,
    );
  }
}
