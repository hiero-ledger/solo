// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
