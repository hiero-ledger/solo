// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot generate the gRPC TLS key for a consensus node; the underlying failure is wrapped
 * in `cause`. solo generates this key to secure node gRPC traffic, so this means key generation failed —
 * for example the key-generation tooling errored or a working file could not be written.
 */
export class GrpcTlsKeyGenerationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to generate gRPC TLS key: ${cause.message}`,
        code: ErrorCodeRegistry.GRPC_TLS_KEY_GENERATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify key generation tools are available\n' +
          'Re-run node setup: solo consensus node setup',
      },
      cause,
    );
  }
}
