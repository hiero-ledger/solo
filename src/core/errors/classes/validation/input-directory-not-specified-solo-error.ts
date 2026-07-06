// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an input directory is required but `--input-dir` was not set. solo reads context data from
 * this directory, so this means the flag must be provided.
 */
export class InputDirectoryNotSpecifiedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Path to context data not specified. Please set a value for --input-dir',
      code: ErrorCodeRegistry.INPUT_DIR_NOT_SPECIFIED,
      troubleshootingSteps:
        'Provide the input directory: solo node <command> --input-dir <path>\n' +
        'Run with --help to see required flags: solo node <command> --help',
    });
  }
}
