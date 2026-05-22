// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';
import {DeploymentCommandDefinition} from '../../../../commands/command-definitions/deployment-command-definition.js';

export class NamespaceNotSetError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Namespace not set',
      code: ErrorCodeRegistry.NAMESPACE_NOT_SET,
      troubleshootingSteps:
        `Ensure a namespace is specified: pass ${Flags.getFormattedFlagKey(Flags.namespace)} <name> to your command\n` +
        `Check deployment config: solo ${DeploymentCommandDefinition.INFO_COMMAND} ${Flags.getFormattedFlagKey(Flags.deployment)} <name>`,
    });
  }
}
