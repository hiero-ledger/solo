// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a flag is declared with a field type solo does not support; the message names the flag and
 * the field type. solo maps flag field types to handling logic, so an unsupported type indicates an
 * internal flag-definition defect and is treated as an internal Solo error.
 */
export class UnsupportedFlagFieldTypeSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(flagName: string, fieldType: string) {
    super({
      message: `Unsupported field type '${fieldType}' for flag '${flagName}'`,
      code: ErrorCodeRegistry.UNSUPPORTED_FLAG_FIELD_TYPE,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
