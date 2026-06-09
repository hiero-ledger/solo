// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ServiceTypeMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(serviceName: string) {
    super({
      message: `Service '${serviceName}' is not a network node service`,
      code: ErrorCodeRegistry.SERVICE_TYPE_MISMATCH,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Inspect Kubernetes services: kubectl get svc -n <namespace>\n' +
        'Verify the network is deployed correctly: solo consensus network deploy',
    });
  }
}
