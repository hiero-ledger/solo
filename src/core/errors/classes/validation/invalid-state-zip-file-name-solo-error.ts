// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class InvalidStateZipFileNameSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(fileName: string) {
    super({
      message: `Invalid state zip file name: ${fileName}`,
      code: ErrorCodeRegistry.INVALID_STATE_ZIP_FILE_NAME,
      troubleshootingSteps:
        'Download a valid state file first: solo consensus state download\n' +
        'Or rename the state zip file to use only letters, numbers, dots, underscores, and hyphens.\n' +
        'The file name must not start with a hyphen and must not contain slashes, spaces, shell syntax, or path traversal.\n' +
        'Example valid name: node1-state.zip',
    });
  }
}
