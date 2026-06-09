// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
