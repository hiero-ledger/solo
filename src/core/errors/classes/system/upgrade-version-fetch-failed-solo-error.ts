// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';

export class UpgradeVersionFetchFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(upgradeVersion: string, cause: Error) {
    super(
      {
        message: `Failed to fetch upgrade version ${upgradeVersion}: ${cause.message}`,
        code: ErrorCodeRegistry.UPGRADE_VERSION_FETCH_FAILED,
        troubleshootingSteps:
          'Check internet connectivity\n' +
          'Verify the version exists: https://github.com/hashgraph/hedera-services/releases\n' +
          `Retry the upgrade: solo ${ConsensusCommandDefinition.UPGRADE_COMMAND} ${Flags.getFormattedFlagKey(Flags.upgradeVersion)} <version>`,
      },
      cause,
    );
  }
}
