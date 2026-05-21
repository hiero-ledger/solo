// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class GrpcProxyEndpointFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = true;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'Failed to set gRPC web proxy endpoint',
      code: ErrorCodeRegistry.GRPC_PROXY_ENDPOINT_FAILED,
      troubleshootingSteps:
        'Check node update transaction logs: tail -f ~/.solo/logs/solo.log | jq\nVerify gRPC endpoints are reachable: kubectl get svc -n <namespace>\nRetry the node update: solo node update',
    });
  }
}
