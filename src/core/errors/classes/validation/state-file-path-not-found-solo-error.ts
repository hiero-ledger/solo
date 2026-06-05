// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class StateFilePathNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(path?: string) {
    super({
      message: `State file path does not exist: ${path ?? '<not specified>'}`,
      code: ErrorCodeRegistry.STATE_FILE_PATH_NOT_FOUND,
      troubleshootingSteps:
        `Verify the path exists: ls -la ${path ?? '<stateFilePath>'}\n` +
        'Download a valid state file first: solo consensus state download\n' +
        'Then provide either the downloaded .zip file or the download parent directory using --state-file <path>\n' +
        'When a directory is provided, Solo looks for state files under: <path>/states/<cluster>/<namespace>',
    });
  }
}
