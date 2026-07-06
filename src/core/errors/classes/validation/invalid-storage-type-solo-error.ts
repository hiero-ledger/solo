// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a storage type value is invalid; the message includes the offending value. solo accepts a
 * fixed set of storage types, so this means the supplied value is not one of them.
 */
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
