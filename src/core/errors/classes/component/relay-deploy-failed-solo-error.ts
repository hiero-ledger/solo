// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo relay node add` cannot deploy the JSON-RPC relay; the underlying failure is wrapped in
 * `cause`. Deploy installs the relay Helm release, so this means that install did not succeed — for example
 * a Helm failure, an image that cannot be pulled, misconfigured values (such as an unreachable network or
 * mirror-node endpoint), or insufficient cluster resources.
 */
export class RelayDeployFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error deploying relay: ${cause.message}`,
        code: ErrorCodeRegistry.RELAY_DEPLOY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect relay pods: kubectl get pods -A -l app.kubernetes.io/instance=relay-<index>\n' +
          'Inspect Helm release: helm status <release> -n <namespace>',
      },
      cause,
    );
  }
}
