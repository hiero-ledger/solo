// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';

export class InvalidStateFileFormatSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(path: string) {
    super({
      message: `State file must be a .zip file: ${path}`,
      code: ErrorCodeRegistry.INVALID_STATE_FILE_FORMAT,
      troubleshootingSteps:
        `Use a state file ending in .zip with ${Flags.getFormattedFlagKey(Flags.stateFile)} <stateFile.zip>\n` +
        'If passing a directory instead, Solo will select node-specific state files from <path>/states/<cluster>/<namespace>.\n' +
        'Expected state zip file name pattern: <pod-name>-state.zip',
    });
  }
}
