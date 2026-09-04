// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo fails to generate the genesis data used to bootstrap a new network; the underlying
 * failure is wrapped in `cause`. Genesis generation produces the initial accounts, keys, and configuration
 * the network starts from, so this means that generation step did not complete — for example required
 * inputs were missing or invalid, or a file could not be written.
 */
export class GenesisDataGenerationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Genesis data generation failed: ${cause.message}`,
        code: ErrorCodeRegistry.GENESIS_DATA_GENERATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify all consensus node configurations are correct\n' +
          'Check deployment configuration: solo deployment config info\n' +
          'Redeploy the network: solo consensus network deploy',
      },
      cause,
    );
  }
}
