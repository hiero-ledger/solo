// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo calls one of its own methods without a required argument or with a value that
 * method cannot accept; the message names the argument. solo makes these checks between its own components, so
 * reaching one points to a defect in solo rather than to user input, and it should be reported with the full
 * error output and the command that triggered it.
 */
export class InvalidArgumentSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(reason: string, value?: unknown, cause?: Error) {
    super(
      {
        message: reason,
        code: ErrorCodeRegistry.INVALID_ARGUMENT,
        troubleshootingSteps: `This is an internal Solo error. File a bug report: ${SoloError.bugReportUrl}`,
      },
      cause,
      value === undefined ? undefined : {value},
    );
  }
}
