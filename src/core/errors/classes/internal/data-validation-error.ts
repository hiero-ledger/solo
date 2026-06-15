// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo detects an unexpected value in an internal data
 * structure. This always indicates a bug in solo itself rather than a user or
 * infrastructure problem. Please file a bug report with the full error output so
 * the team can reproduce and fix the issue.
 */
export class DataValidationError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(context: string, expected: unknown, found: unknown, cause?: Error) {
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
