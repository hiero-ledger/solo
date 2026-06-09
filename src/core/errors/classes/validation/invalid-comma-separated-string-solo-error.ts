// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class InvalidCommaSeparatedStringSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(input: string) {
    super({
      message: `Input '${input}' is not a valid comma-separated string`,
      code: ErrorCodeRegistry.INVALID_COMMA_SEPARATED_STRING,
      troubleshootingSteps:
        'Provide a comma-separated list of values (e.g., node1,node2,node3)\n' +
        'Do not include spaces around commas unless they are part of the values',
    });
  }
}
