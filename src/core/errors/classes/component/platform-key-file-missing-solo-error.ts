// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a required key file is missing; the message names the file. solo expects certain key files to
 * be present when provisioning a node, so this means one of them was not found — for example key generation
 * did not produce it, or it was not copied into the expected location.
 */
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
