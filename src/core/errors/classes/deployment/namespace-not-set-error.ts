// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NamespaceNotSetError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor() {
    super({
      message: 'Namespace not set',
      code: ErrorCodeRegistry.NAMESPACE_NOT_SET,
      troubleshootingSteps:
        'Ensure a namespace is specified: pass --namespace <name> to your command\nCheck deployment config: solo deployment config info --deployment <name>',
    });
  }
}
