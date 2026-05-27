// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';

export class UpgradeVersionNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(upgradeVersion: string) {
    super({
      message: `Upgrade version ${upgradeVersion} does not exist`,
      code: ErrorCodeRegistry.UPGRADE_VERSION_NOT_FOUND,
      troubleshootingSteps:
        'Check valid release versions: https://github.com/hashgraph/hedera-services/releases\n' +
        `Use a published release tag: solo consensus network upgrade ${Flags.getFormattedFlagKey(Flags.upgradeVersion)} v0.x.y`,
    });
  }
}
