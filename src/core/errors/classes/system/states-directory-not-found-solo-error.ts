// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class StatesDirectoryNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(nodeAlias: string, statesDirectory: string) {
    super({
      message: `No states directory found for node ${nodeAlias} at ${statesDirectory}`,
      code: ErrorCodeRegistry.STATES_DIRECTORY_NOT_FOUND,
      troubleshootingSteps:
        'Verify the states directory exists: ls -la <statesDirectory>\nCheck that the state download succeeded: solo node states\nUse the correct --inputDir path structure: <inputDir>/states/<cluster>/<namespace>/',
    });
  }
}
