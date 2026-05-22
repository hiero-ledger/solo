// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';
import {DeploymentCommandDefinition} from '../../../../commands/command-definitions/deployment-command-definition.js';

export class PortForwardMissingSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(componentDisplayName: string, componentId: number, localPort: number, podPort: number) {
    super({
      message: `Configured port-forward is missing: ${componentDisplayName} ${componentId} localhost:${localPort} -> pod:${podPort}`,
      code: ErrorCodeRegistry.PORT_FORWARD_MISSING,
      troubleshootingSteps:
        `Check port-forward status: solo ${DeploymentCommandDefinition.CONNECTIONS_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>\n` +
        `Re-establish port forwards: solo ${ConsensusCommandDefinition.START_COMMAND}\n` +
        'Verify the pod is running: kubectl get pods -n <namespace>',
    });
  }
}
