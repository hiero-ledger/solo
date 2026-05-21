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
          'Check RBAC permissions: kubectl auth can-i create secrets -n <namespace>\nInspect existing secrets: kubectl get secrets -n <namespace>\nReview logs: tail -f ~/.solo/logs/solo.log | jq\nVerify cluster connectivity: kubectl get nodes',
      },
      cause,
    );
  }
}
