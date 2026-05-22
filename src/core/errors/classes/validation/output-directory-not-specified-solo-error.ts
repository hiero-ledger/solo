// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';

export class OutputDirectoryNotSpecifiedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(flagName: string) {
    super({
      message: `Path to export context data not specified. Please set a value for --${flagName}`,
      code: ErrorCodeRegistry.OUTPUT_DIR_NOT_SPECIFIED,
      troubleshootingSteps:
        `Provide the output directory: solo node <command> ${Flags.getFormattedFlagKey(Flags.outputDir)} <path>\n` +
        'Run with --help to see required flags: solo node <command> --help',
    });
  }
}
