// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DataValidationError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(context: string, expected: any, found: any, cause: Error | any = {}) {
    super(
      {
        message: `Data validation failed: ${context} (expected: ${JSON.stringify(expected)}, found: ${JSON.stringify(found)})`,
        code: ErrorCodeRegistry.DATA_VALIDATION,
        troubleshootingSteps:
          'Review the value that caused the failure\nCheck the relevant configuration or input for correctness',
      },
      cause,
      {expected, found},
    );
  }
}
