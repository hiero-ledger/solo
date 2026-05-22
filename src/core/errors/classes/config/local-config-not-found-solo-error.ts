// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {DeploymentCommandDefinition} from '../../../../commands/command-definitions/deployment-command-definition.js';

export class LocalConfigNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(cause?: Error) {
    super(
      {
        message: 'Local configuration file not found',
        code: ErrorCodeRegistry.LOCAL_CONFIG_NOT_FOUND,
        troubleshootingSteps: `Create a local config: solo ${DeploymentCommandDefinition.CREATE_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <deployment-name> ${Flags.getFormattedFlagKey(Flags.namespace)} <namespace>`,
      },
      cause,
    );
  }
}
