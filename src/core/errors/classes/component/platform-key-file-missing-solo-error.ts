// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class PlatformKeyFileMissingSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(keyFile: string) {
    super({
      message: `Key file is missing: ${keyFile}`,
      code: ErrorCodeRegistry.PLATFORM_KEY_FILE_MISSING,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        `Verify the key file exists at: ${keyFile}\n` +
        'Re-generate keys if needed: solo keys consensus\n' +
        'Re-run node setup: solo consensus node setup',
    });
  }
}
