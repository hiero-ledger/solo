// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NonInteractivePromptSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(deploymentFlagKey: string) {
    super({
      message: 'Cannot prompt for input in non-interactive mode',
      code: ErrorCodeRegistry.NON_INTERACTIVE_PROMPT,
      troubleshootingSteps:
        'Provide required flags explicitly instead of relying on interactive prompts\n' +
        `Use ${deploymentFlagKey} <name> to specify the deployment name\n` +
        'Run with --help to see all available flags: solo consensus node --help',
    });
  }
}
