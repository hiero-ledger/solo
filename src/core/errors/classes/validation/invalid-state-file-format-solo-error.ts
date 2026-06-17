// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a state file is not a `.zip`; the message names the path. solo expects saved state as a zip
 * archive, so this means a non-zip file was supplied.
 */
export class InvalidStateFileFormatSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(path: string) {
    super({
      message: `State file must be a .zip file: ${path}`,
      code: ErrorCodeRegistry.INVALID_STATE_FILE_FORMAT,
      troubleshootingSteps:
        'Use a state file ending in .zip with --state-file <stateFile.zip>\n' +
        'Download a valid state file first: solo consensus state download\n' +
        'If passing a directory instead, Solo will select node-specific state files from <path>/states/<cluster>/<namespace>.',
    });
  }
}
