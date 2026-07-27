// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo consensus network destroy` cannot tear down the consensus network; the underlying
 * failure is wrapped in `cause`. Destroy uninstalls the network Helm release and removes its consensus node
 * pods and resources, so this means teardown did not complete — for example a Helm release could not be
 * removed or the cluster API was unreachable.
 */
export class NetworkDestroyFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error destroying network: ${cause.message}`,
        code: ErrorCodeRegistry.NETWORK_DESTROY_FAILED,
        troubleshootingSteps:
          'Check remaining Helm releases: helm list -A\n' +
          'Check for stuck namespaces: kubectl get namespaces\n' +
          'Manually clean up: helm uninstall <chart> -n <namespace>\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
