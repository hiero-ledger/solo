// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an internal consistency check finds a value that differs from
 * what solo required at that point; the message reports the context together with the
 * expected and actual values. solo uses these assertions to verify invariants as data moves
 * between steps — for example confirming that a downloaded artifact's checksum matches the
 * expected hash before it is used. A mismatch points to a logic error or a broken assumption
 * inside solo rather than to bad user input or an infrastructure fault, so it is treated as an
 * internal defect and should be reported with the full error output.
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
