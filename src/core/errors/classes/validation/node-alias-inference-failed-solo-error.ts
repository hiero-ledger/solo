// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot infer a node alias from address data; the message includes the offending data.
 * solo derives aliases from address-book data, so this means the data did not yield a usable alias — for
 * example a malformed or unexpected entry.
 */
export class NodeAliasInferenceFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(addressData: string) {
    super({
      message: `Node alias cannot be inferred from address data: ${addressData}`,
      code: ErrorCodeRegistry.NODE_ALIAS_INFERENCE_FAILED,
      troubleshootingSteps:
        'Verify the address data format is correct\n' + 'Ensure the address book contains valid node alias information',
    });
  }
}
