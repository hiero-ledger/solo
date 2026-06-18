// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a command needs a target Kubernetes namespace but none could be
 * resolved. solo determines the namespace from the `--namespace` flag or from the selected
 * deployment's configuration, so this is raised when neither is available — the flag was not
 * passed and the deployment has no namespace recorded. Supply `--namespace`, or select a
 * deployment whose configuration defines one.
 */
export class NamespaceNotSetError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Namespace not set',
      code: ErrorCodeRegistry.NAMESPACE_NOT_SET,
      troubleshootingSteps:
        'Ensure a namespace is specified: pass --namespace <name> to your command\n' +
        'Check deployment config: solo deployment config info --deployment <name>',
    });
  }
}
