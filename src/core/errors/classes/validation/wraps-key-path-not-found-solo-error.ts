// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class WrapsKeyPathNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(wrapsKeyPath: string) {
    super({
      message: `WRAPs key path does not exist: ${wrapsKeyPath}`,
      code: ErrorCodeRegistry.WRAPS_KEY_PATH_NOT_FOUND,
      troubleshootingSteps:
        'Verify the path: ls -la <wrapsKeyPath>\n' +
        'Set the correct path: solo node add --wraps-key-path <path>\n' +
        'Or omit the flag to download WRAPs keys automatically',
    });
  }
}
