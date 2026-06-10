// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class InvalidConfigNumberValueSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(value: string, cause: Error) {
    super(
      {
        message: `Invalid numeric configuration value '${value}': ${cause.message}`,
        code: ErrorCodeRegistry.INVALID_CONFIG_NUMBER_VALUE,
        troubleshootingSteps:
          'Provide a valid integer or decimal number for this configuration option\n' +
          'Run solo --help for usage information',
      },
      cause,
    );
  }
}
