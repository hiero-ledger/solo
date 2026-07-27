// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo relay node destroy` cannot tear down the JSON-RPC relay; the underlying failure is
 * wrapped in `cause`. Destroy uninstalls the relay Helm release and removes its resources, so this means
 * teardown did not complete — for example a Helm release could not be removed or the cluster API was
 * unreachable.
 */
export class RelayDestroyFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error destroying relay: ${cause.message}`,
        code: ErrorCodeRegistry.RELAY_DESTROY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'List Helm releases: helm list -A\n' +
          'Force-uninstall if stuck: helm uninstall <release> -n <namespace>',
      },
      cause,
    );
  }
}
