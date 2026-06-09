// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class CacheProviderNotConfiguredSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(name: string, missing: 'provider' | 'engine') {
    super({
      message: `${name}: cache ${missing} must be set before building`,
      code: ErrorCodeRegistry.CACHE_PROVIDER_NOT_CONFIGURED,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
