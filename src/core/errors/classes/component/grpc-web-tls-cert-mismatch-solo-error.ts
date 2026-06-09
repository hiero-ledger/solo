// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class GrpcWebTlsCertMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(certPaths: string, keyPaths: string) {
    super({
      message:
        "The structure of the gRPC Web TLS Certificate doesn't match. " +
        `Certificates: ${certPaths}, Keys: ${keyPaths}`,
      code: ErrorCodeRegistry.GRPC_WEB_TLS_CERT_MISMATCH,
      troubleshootingSteps:
        'Ensure the number of certificate paths matches the number of key paths\n' +
        'Each certificate must have a corresponding private key in the same position\n' +
        'Verify the certificate and key files exist at the specified paths',
    });
  }
}
