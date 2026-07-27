// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an output directory is required but `--output-dir` was not set. solo exports context data to
 * this directory, so this means the flag must be provided.
 */
export class OutputDirectoryNotSpecifiedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Path to export context data not specified. Please set a value for --output-dir',
      code: ErrorCodeRegistry.OUTPUT_DIR_NOT_SPECIFIED,
      troubleshootingSteps:
        'Provide the output directory: solo node <command> --output-dir <path>\n' +
        'Run with --help to see required flags: solo node <command> --help',
    });
  }
}
