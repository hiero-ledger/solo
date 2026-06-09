// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class TlsKeyGenerationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(errorMessage: string) {
    super({
      message: `TLS key generation failed: ${errorMessage}`,
      code: ErrorCodeRegistry.TLS_KEY_GENERATION_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify required key generation tools are available\n' +
        'Re-run node setup: solo consensus node setup',
    });
  }
}
