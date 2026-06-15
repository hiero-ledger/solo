// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a required CLI argument or configuration value is absent.
 * The error message identifies the specific argument that is missing. Run the
 * failing command with `--help` to see which flags are required and their expected
 * format.
 */
export class MissingArgumentError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(argumentDescription: string, cause: Error | any = {}) {
    super(
      {
        message: argumentDescription,
        code: ErrorCodeRegistry.MISSING_ARGUMENT,
        troubleshootingSteps: 'Provide the missing argument. Run solo --help for usage information',
      },
      cause,
    );
  }
}
