// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class CacheImageTemplateUndeclaredError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(template: string) {
    super({
      message: `Undeclared cache image template key used in version field: ${template}. Add it to templates first.`,
      code: ErrorCodeRegistry.CACHE_IMAGE_TEMPLATE_UNDECLARED,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
