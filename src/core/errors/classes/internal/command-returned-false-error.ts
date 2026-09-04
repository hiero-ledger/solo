// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a command handler returns `false` from a path that requires it to
 * return `true` to signal success; the message names the command namespace and command that
 * did so. solo treats the boolean return of these handlers as a success flag, so a `false`
 * here means the handler completed without throwing yet reported failure — an unexpected
 * internal outcome that indicates a defect in solo rather than invalid user input.
 */
export class CommandReturnedFalseError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(commandNamespace: string, command: string) {
    super({
      message: `${commandNamespace} ${command} failed — expected returned value to be true`,
      code: ErrorCodeRegistry.COMMAND_RETURNED_FALSE,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
