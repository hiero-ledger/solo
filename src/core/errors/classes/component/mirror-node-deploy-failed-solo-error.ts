// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo mirror node add` cannot deploy the mirror node; the underlying failure is wrapped in
 * `cause`. Deploy installs the mirror node Helm release (its importer, REST, and database components), so
 * this means that install did not succeed — for example a Helm failure, an image that cannot be pulled,
 * misconfigured values, or insufficient cluster resources.
 */
export class MirrorNodeDeployFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error deploying mirror node: ${cause.message}`,
        code: ErrorCodeRegistry.MIRROR_NODE_DEPLOY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect mirror node pods: kubectl get pods -A -l app.kubernetes.io/instance=mirror-<index>\n' +
          'Inspect Helm release: helm status <release> -n <namespace>',
      },
      cause,
    );
  }
}
