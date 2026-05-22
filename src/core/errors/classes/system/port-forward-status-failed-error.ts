// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {DeploymentCommandDefinition} from '../../../../commands/command-definitions/deployment-command-definition.js';

export class PortForwardStatusFailedError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Error displaying port-forward status',
        code: ErrorCodeRegistry.PORT_FORWARD_STATUS_FAILED,
        troubleshootingSteps:
          'Check the all pods exist and are running: kubectl get pods -n <namespace>\n' +
          `Restart the port-forward: solo ${DeploymentCommandDefinition.REFRESH_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <deployment-name>`,
      },
      cause,
    );
  }
}
