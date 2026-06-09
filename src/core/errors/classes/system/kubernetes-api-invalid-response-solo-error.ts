// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class KubernetesApiInvalidResponseSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'Received an incorrect or unexpected response from the Kubernetes API',
      code: ErrorCodeRegistry.KUBERNETES_API_INVALID_RESPONSE,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify Kubernetes API server is reachable: kubectl cluster-info\n' +
        'Check kubeconfig context: kubectl config current-context\n' +
        'Inspect Kubernetes API server health',
    });
  }
}
