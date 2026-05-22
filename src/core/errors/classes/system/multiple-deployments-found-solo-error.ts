// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {DeploymentCommandDefinition} from '../../../../commands/command-definitions/deployment-command-definition.js';

export class MultipleDeploymentsFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(source: 'remote' | 'local', deploymentNames: string, flagName: string) {
    super({
      message: `Multiple deployments found in ${source} config (${deploymentNames}). Please provide --${flagName}`,
      code: ErrorCodeRegistry.MULTIPLE_DEPLOYMENTS_FOUND,
      troubleshootingSteps:
        `List existing deployments: solo ${DeploymentCommandDefinition.LIST_COMMAND}\n` +
        `Specify the deployment explicitly: solo node <command> ${Flags.getFormattedFlagKey(Flags.deployment)} <name>`,
    });
  }
}
