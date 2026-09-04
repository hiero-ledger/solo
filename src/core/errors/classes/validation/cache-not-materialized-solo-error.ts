// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the cache is used before it has been materialized. solo requires the cache to be populated
 * before it can be read, so this means a read happened too early in the workflow — materialize the cache
 * first.
 */
export class CacheNotMaterializedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Cache has not been materialized yet',
      code: ErrorCodeRegistry.CACHE_NOT_MATERIALIZED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Run the cache pull step before using cached images: solo cache image --help',
    });
  }
}
