// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a cache is built before its required provider or engine has been set; the message names the
 * cache and which piece is missing. solo requires both to be configured before constructing the cache, so
 * reaching this points to an internal setup or ordering defect rather than user input, and is treated as an
 * internal Solo error.
 */
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
