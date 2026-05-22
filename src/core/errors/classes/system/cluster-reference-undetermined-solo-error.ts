// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {DeploymentCommandDefinition} from '../../../../commands/command-definitions/deployment-command-definition.js';

export class ClusterReferenceUndeterminedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor() {
    super({
      message: 'Error during initialization, cluster reference could not be determined',
      code: ErrorCodeRegistry.CLUSTER_REF_UNDETERMINED,
      troubleshootingSteps:
        'Check the remote config: kubectl get configmap -n <namespace> -o yaml\n' +
        `Verify cluster references: solo ${DeploymentCommandDefinition.INFO_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>\n` +
        'Re-initialize solo if needed: solo init\n' +
        'Review solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
