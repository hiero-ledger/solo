// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo consensus network deploy` cannot bring up the consensus
 * network; the underlying failure is wrapped in `cause`. This step installs the
 * `solo-deployment` Helm chart that creates the consensus node pods and their supporting
 * services, so the error means that install did not succeed. Typical roots are a Helm release
 * failure (bad chart version or values), an image that cannot be pulled, insufficient cluster
 * resources to schedule the nodes, or a loss of connectivity to the cluster during the deploy.
 */
export class DeployNetworkFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Network deployment failed: ${cause.message}`,
        code: ErrorCodeRegistry.DEPLOY_NETWORK_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect consensus node pods: kubectl get pods -A\n' +
          'Check Helm release status: helm list -A\n' +
          'Verify cluster connectivity: kubectl cluster-info',
      },
      cause,
    );
  }
}
