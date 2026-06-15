// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown while validating a port value supplied through a CLI flag or
 * configuration field, when the value does not denote a usable TCP/UDP port: it is not an
 * integer, or it falls outside the valid range of 1–65535. The error message echoes the
 * offending value. This is raised before solo tries to bind, forward, or configure the port,
 * so it reflects bad input (a typo, a non-numeric string, or `0`/a negative/too-large number)
 * rather than a port that is already in use.
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
