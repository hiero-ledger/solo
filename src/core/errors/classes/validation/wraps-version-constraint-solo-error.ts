// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';

export class WrapsVersionConstraintSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(minimumVersion: string) {
    super({
      message: `"${Flags.getFormattedFlagKey(Flags.wrapsEnabled)}" requires consensus node >= ${minimumVersion}`,
      code: ErrorCodeRegistry.WRAPS_VERSION_CONSTRAINT,
      troubleshootingSteps:
        `Upgrade consensus node first: solo consensus network upgrade ${Flags.getFormattedFlagKey(Flags.upgradeVersion)} <minimumVersion>\n` +
        `Or disable WRAPs: solo consensus network deploy ${Flags.getFormattedFlagKey(Flags.wrapsEnabled)} false`,
    });
  }
}
