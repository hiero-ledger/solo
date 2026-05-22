// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {DeploymentCommandDefinition} from '../../../../commands/command-definitions/deployment-command-definition.js';

export class NoClustersForDeploymentError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deployment: string) {
    super({
      message: `No clusters found for deployment ${deployment}`,
      code: ErrorCodeRegistry.NO_CLUSTERS_FOR_DEPLOYMENT,
      troubleshootingSteps: `Attach a cluster to the deployment: solo ${DeploymentCommandDefinition.ATTACH_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>`,
    });
  }
}
