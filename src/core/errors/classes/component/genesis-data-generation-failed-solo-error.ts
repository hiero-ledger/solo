// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
