// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot generate a node signing key; the underlying failure is wrapped in `cause`.
 * Signing keys establish a consensus node identity, so this means generation failed — for example the
 * key-generation tooling errored or a working file could not be written.
 */
export class SigningKeyGenerationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to generate signing key: ${cause.message}`,
        code: ErrorCodeRegistry.SIGNING_KEY_GENERATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify key generation tools are available\n' +
          'Re-run key generation: solo keys consensus',
      },
      cause,
    );
  }
}
