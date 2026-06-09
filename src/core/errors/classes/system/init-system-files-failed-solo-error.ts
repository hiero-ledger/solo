// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class InitSystemFilesFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to initialize Solo system files: ${cause.message}`,
        code: ErrorCodeRegistry.INIT_SYSTEM_FILES_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify write permissions for the Solo home directory (~/.solo)\n' +
          'Check available disk space\n' +
          'Re-run initialization: solo init',
      },
      cause,
    );
  }
}
