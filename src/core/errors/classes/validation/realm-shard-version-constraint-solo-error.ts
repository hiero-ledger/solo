// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';

export class RealmShardVersionConstraintSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(minimumVersion: string) {
    super({
      message: `The realm and shard values must be 0 when using a network node version older than ${minimumVersion}`,
      code: ErrorCodeRegistry.REALM_SHARD_VERSION_CONSTRAINT,
      troubleshootingSteps:
        `Use realm=0 and shard=0: solo ${ConsensusCommandDefinition.DEPLOY_COMMAND} ${Flags.getFormattedFlagKey(Flags.realm)} 0 ${Flags.getFormattedFlagKey(Flags.shard)} 0\n` +
        `Or upgrade to network node >= <minimumVersion>: solo ${ConsensusCommandDefinition.UPGRADE_COMMAND} ${Flags.getFormattedFlagKey(Flags.upgradeVersion)} <version>`,
    });
  }
}
