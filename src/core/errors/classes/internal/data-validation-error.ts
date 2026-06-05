// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DataValidationError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(context: string, expected: any, found: any, cause?: Error) {
    super(
      {
        message: `Data validation failed: ${context} (expected: ${JSON.stringify(expected)}, found: ${JSON.stringify(found)})`,
        code: ErrorCodeRegistry.DATA_VALIDATION,
        troubleshootingSteps: `This is an internal Solo error. File a bug report: ${SoloError.bugReportUrl}`,
      },
      cause,
      {expected, found},
    );
  }
}
