// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot prepare the Falcon values file used during deployment; the underlying failure is
 * wrapped in `cause`. solo assembles this Helm values file from configuration and runtime inputs before
 * installing, so this means that preparation step failed — for example a required input was missing or
 * invalid, or the file could not be written.
 */
export class FalconValuesPreparationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error preparing falcon values file: ${cause.message}`,
        code: ErrorCodeRegistry.FALCON_VALUES_PREPARATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the profile YAML is valid: solo deployment profile validate',
      },
      cause,
    );
  }
}
