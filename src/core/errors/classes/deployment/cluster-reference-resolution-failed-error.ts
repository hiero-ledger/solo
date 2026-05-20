// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ClusterReferenceResolutionFailedError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(deployment: string) {
    super({
      message: `Failed to get cluster reference for deployment ${deployment}`,
      code: ErrorCodeRegistry.CLUSTER_REFERENCE_RESOLUTION_FAILED,
      troubleshootingSteps:
        'Verify the deployment has clusters attached: solo deployment config info --deployment <name>\nIf the issue persists, please report it at https://github.com/hiero-ledger/solo/issues',
    });
  }
}
