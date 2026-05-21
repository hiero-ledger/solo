// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class GrpcEndpointsRequiredSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(endpointType: string) {
    super({
      message: `--grpc-endpoints must be set if --endpoint-type is: ${endpointType}`,
      code: ErrorCodeRegistry.GRPC_ENDPOINTS_REQUIRED,
      troubleshootingSteps:
        'Provide gRPC endpoints: solo node add --grpc-endpoints <ip:port,...>\n' +
        'Or switch endpoint type: solo node add --endpoint-type FQDN\n' +
        'Review flag usage: solo node add --help',
    });
  }
}
