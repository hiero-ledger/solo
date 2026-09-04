// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an endpoint is not in the expected `url:port` format; the message includes the offending
 * value. solo parses endpoints from flags and config, so this means the value is malformed — provide it as
 * `url:port`.
 */
export class InvalidEndpointFormatSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(endpoint: string) {
    super({
      message: `Incorrect endpoint format. Expected url:port, found: ${endpoint}`,
      code: ErrorCodeRegistry.INVALID_ENDPOINT_FORMAT,
      troubleshootingSteps:
        'Provide the endpoint in url:port format (e.g., 127.0.0.1:50211)\n' + 'Run solo --help for usage information',
    });
  }
}
