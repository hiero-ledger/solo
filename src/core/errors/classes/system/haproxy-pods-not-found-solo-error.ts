// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';
import {DeploymentCommandDefinition} from '../../../../commands/command-definitions/deployment-command-definition.js';

export class HaproxyPodsNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'No HAProxy pods found',
      code: ErrorCodeRegistry.HAPROXY_PODS_NOT_FOUND,
      troubleshootingSteps:
        'Check HAProxy pod status: kubectl get pods -n <namespace> -l solo.hedera.com/type=haproxy\n' +
        `Check the active deployment: solo ${DeploymentCommandDefinition.INFO_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>\n` +
        `Redeploy the network if HAProxy is missing: solo ${ConsensusCommandDefinition.DEPLOY_COMMAND}`,
    });
  }
}
