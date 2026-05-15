// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DataValidationError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(message: string, expected: any, found: any, cause: Error | any = {}) {
    super({message, code: ErrorCodeRegistry.DATA_VALIDATION}, cause, {expected, found});
  }
}
