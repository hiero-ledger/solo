// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an output format is not one of the allowed values; the message names the offending value and
 * the allowed set (`json`, `yaml`, `wide`). solo formats command output according to this flag, so this
 * means an unsupported value was supplied.
 */
export class InvalidOutputFormatError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(format: string) {
    super({
      message: `Invalid output format: ${format}. Allowed values: json, yaml, wide`,
      code: ErrorCodeRegistry.INVALID_OUTPUT_FORMAT,
      troubleshootingSteps: 'Valid output formats are: json, yaml, wide',
    });
  }
}
