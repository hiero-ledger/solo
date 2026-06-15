// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a port number supplied via a CLI flag or configuration
 * value is outside the valid TCP/UDP range (1–65535) or is not an integer. Check
 * the flag that accepts port values in the command you ran and correct the input.
 */
export class InvalidPortNumberError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(port: number | string) {
    super({
      message: `Invalid port number: ${port}`,
      code: ErrorCodeRegistry.INVALID_PORT_NUMBER,
      troubleshootingSteps: 'Port numbers must be integers between 1 and 65535',
    });
  }
}
