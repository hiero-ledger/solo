// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class RelayNotRunningSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(releaseName: string, cause: Error) {
    super(
      {
        message: `Relay ${releaseName} is not running: ${cause.message}`,
        code: ErrorCodeRegistry.RELAY_NOT_RUNNING,
        troubleshootingSteps:
          `Check relay pod status: kubectl get pods -A | grep ${releaseName}\n` +
          `View relay pod logs: kubectl logs -n <namespace> -l app.kubernetes.io/instance=${releaseName}\n` +
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
      },
      cause,
    );
  }
}
