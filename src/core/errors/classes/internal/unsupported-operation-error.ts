// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
