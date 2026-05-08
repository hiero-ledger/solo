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
        message: `Remote configurations in clusters ${cluster1} and ${cluster2} do not match`,
        code: ErrorCodeRegistry.REMOTE_CONFIGS_MISMATCH,
        troubleshootingSteps: 'Inspect both configs: kubectl get configmap -n solo\nSync manually before retrying',
      },
      cause,
    );
  }
}
