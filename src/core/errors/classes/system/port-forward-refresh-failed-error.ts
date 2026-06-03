// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';

export class PortForwardRefreshFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error refreshing port-forwards',
        code: ErrorCodeRegistry.PORT_FORWARD_REFRESH_FAILED,
        troubleshootingSteps:
          'Check the all pods exist and are running: kubectl get pods -n <namespace>\n' +
          `Check the port-forwards of your deployment: solo deployment config ports ${Flags.getFormattedFlagKey(Flags.deployment)} <deployment-name>\n` +
          `Restart the port-forward: solo deployment refresh port-forwards ${Flags.getFormattedFlagKey(Flags.deployment)} <deployment-name>`,
      },
      cause,
    );
  }
}
