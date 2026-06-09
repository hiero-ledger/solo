// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DomainNameParseFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(data: string) {
    super({
      message: `Cannot parse domain name from: ${data}`,
      code: ErrorCodeRegistry.DOMAIN_NAME_PARSE_FAILED,
      troubleshootingSteps:
        'Verify the domain name format is correct\n' + 'Check the address book configuration for valid domain names',
    });
  }
}
