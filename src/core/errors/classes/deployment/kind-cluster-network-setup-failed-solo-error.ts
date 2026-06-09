// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class KindClusterNetworkSetupFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Kind cluster network setup or MetalLB repository configuration failed: ${cause.message}`,
        code: ErrorCodeRegistry.KIND_CLUSTER_NETWORK_SETUP_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify Docker is running: docker ps\n' +
          'Check existing Kind clusters: kind get clusters\n' +
          'Verify Helm repository access: helm repo list',
      },
      cause,
    );
  }
}
