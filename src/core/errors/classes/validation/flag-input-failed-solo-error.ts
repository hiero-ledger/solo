// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when input validation for a flag fails; the message names the flag and wraps the underlying
 * failure in `cause`. solo validates and coerces flag inputs before using them, so this means the provided
 * value did not pass validation — correct the flag value.
 */
export class FlagInputFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(flagName: string, cause: Error) {
    super(
      {
        message: `Input validation failed for flag '${flagName}': ${cause.message}`,
        code: ErrorCodeRegistry.FLAG_INPUT_FAILED,
        troubleshootingSteps:
          `Verify the value provided for --${flagName} is valid\n` +
          'Run solo --help for usage information and accepted flag values',
      },
      cause,
    );
  }
}
