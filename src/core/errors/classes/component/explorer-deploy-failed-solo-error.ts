// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo explorer node add` cannot bring up the Hiero Explorer: the
 * Helm release for the explorer chart failed to install, or its pods never reached a Ready
 * state before solo stopped waiting. The original failure is wrapped in `cause.message`.
 * Typical roots are an explorer image that cannot be pulled, misconfigured chart values
 * (for example an unreachable mirror-node endpoint), a TLS/cert-manager prerequisite that is
 * not ready, or insufficient cluster resources to schedule the pod.
 */
export class ExplorerDeployFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error deploying explorer: ${cause.message}`,
        code: ErrorCodeRegistry.EXPLORER_DEPLOY_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect explorer pods: kubectl get pods -A -l app.kubernetes.io/component=hiero-explorer\n' +
          'Inspect Helm release: helm status <release> -n <namespace>',
      },
      cause,
    );
  }
}
