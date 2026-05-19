// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
