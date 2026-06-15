// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a code path that is not yet implemented or deliberately
 * unsupported is reached at runtime. This always indicates a bug in solo — please
 * file a bug report with the full error output and the command you ran.
 */
export class UnsupportedOperationError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(reason: string, cause?: Error) {
    super(
      {
        message: reason,
        code: ErrorCodeRegistry.UNSUPPORTED_OPERATION,
        troubleshootingSteps: `This is an internal Solo error. File a bug report: ${SoloError.bugReportUrl}`,
      },
      cause,
    );
  }
}
