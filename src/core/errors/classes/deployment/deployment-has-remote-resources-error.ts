// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {BlockCommandDefinition} from '../../../../commands/command-definitions/block-command-definition.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';
import {ExplorerCommandDefinition} from '../../../../commands/command-definitions/explorer-command-definition.js';
import {MirrorCommandDefinition} from '../../../../commands/command-definitions/mirror-command-definition.js';
import {RelayCommandDefinition} from '../../../../commands/command-definitions/relay-command-definition.js';

export class DeploymentHasRemoteResourcesError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deployment: string, clusterReference: string) {
    super({
      message: `Deployment ${deployment} has remote resources in cluster: ${clusterReference}`,
      code: ErrorCodeRegistry.DEPLOYMENT_HAS_REMOTE_RESOURCES,
      troubleshootingSteps:
        'Destroy all components in the deployment before deleting it:\n' +
        `solo ${MirrorCommandDefinition.DESTROY_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>\n` +
        `solo ${RelayCommandDefinition.DESTROY_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>\n` +
        `solo ${ExplorerCommandDefinition.DESTROY_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>\n` +
        `solo ${BlockCommandDefinition.DESTROY_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>\n` +
        `solo ${ConsensusCommandDefinition.DESTROY_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>`,
    });
  }
}
