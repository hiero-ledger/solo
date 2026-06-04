// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
