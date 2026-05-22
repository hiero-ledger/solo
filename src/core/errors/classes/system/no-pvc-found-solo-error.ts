// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';

export class NoPvcFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(namespace: string) {
    super({
      message: `No PVCs found in namespace ${namespace}. Please ensure PVCs are enabled during network deployment`,
      code: ErrorCodeRegistry.NO_PVC_FOUND,
      troubleshootingSteps: `Redeploy with PVCs enabled: solo ${ConsensusCommandDefinition.DEPLOY_COMMAND} ${Flags.getFormattedFlagKey(Flags.persistentVolumeClaims)} true`,
    });
  }
}
