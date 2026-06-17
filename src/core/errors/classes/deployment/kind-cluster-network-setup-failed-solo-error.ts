// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot configure networking for a Kind cluster — either the
 * Kind network setup itself or the MetalLB Helm repository configuration it depends on; the
 * underlying failure is wrapped in `cause`. solo configures MetalLB so that LoadBalancer
 * services in the local Kind cluster receive reachable addresses, and raises this when that
 * setup fails. Common roots are Docker not running (Kind needs it), an unreachable or
 * misconfigured Helm repository, or a problem with the Kind cluster's Docker network.
 */
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
