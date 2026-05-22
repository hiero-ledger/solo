// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';
import {DeploymentCommandDefinition} from '../../../../commands/command-definitions/deployment-command-definition.js';

export class NamespaceNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(namespace: string) {
    super({
      message: `Namespace ${namespace} does not exist`,
      code: ErrorCodeRegistry.NAMESPACE_NOT_FOUND,
      troubleshootingSteps:
        'List existing namespaces: kubectl get namespaces\n' +
        `Check the active deployment: solo ${DeploymentCommandDefinition.INFO_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>\n` +
        `Redeploy the network to re-create the namespace: solo ${ConsensusCommandDefinition.DEPLOY_COMMAND}`,
    });
  }
}
