// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when execution reaches a branch that is intentionally not implemented
 * or not supported — for example an abstract operation a subclass was expected to override, a
 * not-yet-built feature path, or an input variant the code does not handle; the message
 * states the reason. Because solo should never route a real command into such a path, this is
 * classified as a defect in solo itself rather than a user or infrastructure problem, and
 * reaching it should be reported with the full error output and the command that triggered it.
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
