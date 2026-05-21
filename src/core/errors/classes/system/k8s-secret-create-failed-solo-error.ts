// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class K8sSecretCreateFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(description: string, cause?: Error) {
    super(
      {
        message: description,
        code: ErrorCodeRegistry.K8S_SECRET_CREATE_FAILED,
        troubleshootingSteps:
          'Check RBAC permissions: kubectl auth can-i create secrets -n <namespace>\n' +
          'Inspect existing secrets: kubectl get secrets -n <namespace>\n' +
          'Review solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify the cluster is reachable: kubectl cluster-info --context <context>',
      },
      cause,
    );
  }
}
