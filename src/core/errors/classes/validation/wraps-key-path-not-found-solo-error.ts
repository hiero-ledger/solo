// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {ConsensusCommandDefinition} from '../../../../commands/command-definitions/consensus-command-definition.js';

export class WrapsKeyPathNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(wrapsKeyPath: string) {
    super({
      message: `WRAPs key path does not exist: ${wrapsKeyPath}`,
      code: ErrorCodeRegistry.WRAPS_KEY_PATH_NOT_FOUND,
      troubleshootingSteps:
        'Verify the path: ls -la <wrapsKeyPath>\n' +
        `Set the correct path: solo ${ConsensusCommandDefinition.ADD_COMMAND} ${Flags.getFormattedFlagKey(Flags.wrapsKeyPath)} <path>\n` +
        'Or omit the flag to download WRAPs keys automatically',
    });
  }
}
