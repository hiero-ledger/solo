// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class LoadBalancerNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'Load balancer not found',
      code: ErrorCodeRegistry.LOAD_BALANCER_NOT_FOUND,
      troubleshootingSteps:
        'Check load balancer service status: kubectl get svc -n <namespace> -l solo.hedera.com/type=network-node\n' +
        'Ensure your cloud provider supports LoadBalancer services\n' +
        'Review cloud provisioning logs for LB assignment delays',
    });
  }
}
