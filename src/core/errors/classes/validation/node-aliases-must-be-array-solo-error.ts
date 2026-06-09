// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NodeAliasesMustBeArraySoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor() {
    super({
      message: 'nodeAliases must be an array of strings',
      code: ErrorCodeRegistry.NODE_ALIASES_MUST_BE_ARRAY,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
