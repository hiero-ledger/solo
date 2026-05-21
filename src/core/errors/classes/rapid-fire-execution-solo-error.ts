// SPDX-License-Identifier: Apache-2.0

import {ErrorCodeRegistry} from '../error-code-registry.js';
import {ErrorOwnership} from '../error-ownership.js';
import {SoloError} from '../solo-error.js';

export class RapidFireExecutionSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(message: string, cause?: Error) {
    super(
      {
        message,
        code: ErrorCodeRegistry.RAPID_FIRE_EXECUTION_FAILED,
        troubleshootingSteps:
          'Inspect diagnostics path printed in the error output\nCheck NLG pod logs for completion lines and TPS values\nRetry with lower load parameters or --max-tps',
      },
      cause,
    );
  }
}
