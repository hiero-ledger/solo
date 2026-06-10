// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class InvalidStorageTypeSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(value: string) {
    super({
      message: `Invalid storage type value '${value}'`,
      code: ErrorCodeRegistry.INVALID_STORAGE_TYPE,
      troubleshootingSteps:
        'Provide a valid storage type value\n' + 'Run solo --help for usage information and supported storage types',
    });
  }
}
