// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class IllegalArgumentError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(reason: string, value?: any, cause?: Error) {
    super(
      {
        message: reason,
        code: ErrorCodeRegistry.ILLEGAL_ARGUMENT,
        troubleshootingSteps: 'Run solo --help for usage information\nVerify the argument value before retrying',
      },
      cause,
      value === undefined ? undefined : {value},
    );
  }
}
