// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NamespaceNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(namespace: string) {
    super({
      message: `Namespace ${namespace} does not exist`,
      code: ErrorCodeRegistry.NAMESPACE_NOT_FOUND,
      troubleshootingSteps:
        'List existing namespaces: kubectl get namespaces\nCreate the namespace: kubectl create namespace <namespace>\nOr redeploy: solo network deploy --namespace <namespace>',
    });
  }
}
