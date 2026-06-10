// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class InvalidHbarAmountSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(amount: string) {
    super({
      message: `Invalid HBAR amount: ${amount}`,
      code: ErrorCodeRegistry.INVALID_HBAR_AMOUNT,
      troubleshootingSteps:
        'Provide a valid positive numeric HBAR amount (e.g., 100 or 0.5)\n' +
        'Run solo ledger account create --help for usage information',
    });
  }
}
