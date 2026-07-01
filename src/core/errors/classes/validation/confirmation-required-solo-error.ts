// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an action requires interactive confirmation but solo cannot ask for it (for example when
 * running with --quiet or --force, or in a non-interactive environment such as CI). Rather than proceed without the
 * user's consent, solo refuses and asks the user to confirm interactively.
 */
export class ConfirmationRequiredSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  /**
   * @param action - short description of the action that needs confirmation, e.g. "cleaning up an existing deployment".
   * @param troubleshootingSteps - optional override for the default guidance shown to the user.
   */
  public constructor(action: string, troubleshootingSteps?: string) {
    super({
      message: `Confirmation required before ${action}, but solo is running non-interactively`,
      code: ErrorCodeRegistry.CONFIRMATION_REQUIRED,
      troubleshootingSteps:
        troubleshootingSteps ??
        'Re-run the command interactively (without --quiet or --force) so the confirmation prompt can be shown',
    });
  }
}
