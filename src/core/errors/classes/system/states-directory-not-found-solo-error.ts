// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the states directory for a node does not exist; the message names the node alias and the
 * expected directory. solo reads saved consensus state from this directory, so this means it is missing or
 * the path is wrong — for example no state was exported for the node, or the wrong path was supplied.
 */
export class StatesDirectoryNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(nodeAlias: string, statesDirectory: string) {
    super({
      message: `No states directory found for node ${nodeAlias} at ${statesDirectory}`,
      code: ErrorCodeRegistry.STATES_DIRECTORY_NOT_FOUND,
      troubleshootingSteps:
        'Verify the states directory exists: ls -la <statesDirectory>\n' +
        'Check that the state download succeeded: solo consensus node states\n' +
        'Use the correct --inputDir path structure: <inputDir>/states/<cluster>/<namespace>/',
    });
  }
}
