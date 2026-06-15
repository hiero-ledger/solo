// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when code reaches a point that requires a value but the value is
 * absent or empty; the error message describes the argument that was expected. In most cases
 * this is a required CLI flag or configuration value that the command was invoked without
 * (for example a deployment selection left empty). It is also used as an internal guard when
 * a method is called without a mandatory argument, in which case it points to a defect in the
 * calling code rather than to user input.
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
