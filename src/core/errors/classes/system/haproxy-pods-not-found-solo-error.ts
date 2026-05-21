// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class HaproxyPodsNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'No HAProxy pods found',
      code: ErrorCodeRegistry.HAPROXY_PODS_NOT_FOUND,
      troubleshootingSteps:
        'Check HAProxy pod status: kubectl get pods -n <namespace> -l solo.hedera.com/type=haproxy\nVerify the network is deployed: solo network status\nRedeploy if necessary: solo network deploy',
    });
  }
}
