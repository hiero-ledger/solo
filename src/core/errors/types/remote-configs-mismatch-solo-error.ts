// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../solo-error.js';
import {ErrorOwnership} from '../error-ownership.js';
import {ErrorCodeRegistry} from '../error-code-registry.js';

export class RemoteConfigsMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cluster1: string, cluster2: string, cause?: Error) {
    super(
      {
        localeKey: 'remote_configs_mismatch',
        code: ErrorCodeRegistry.REMOTE_CONFIGS_MISMATCH,
        context: {cluster1, cluster2},
      },
      cause,
    );
  }
}
