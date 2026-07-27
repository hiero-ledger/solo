// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot create the TLS certificate secret used by the Hiero Explorer; when available the
 * underlying failure is wrapped in `cause`. The explorer is served over TLS using a certificate stored as a
 * Kubernetes secret, so this means that secret could not be created — for example the namespace is missing,
 * a conflicting secret exists, or the Kubernetes API rejected the request.
 */
export class ExplorerTlsSecretCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause?: Error) {
    super(
      {
        message: `Failed to create explorer TLS certificate secret${cause ? ': ' + cause.message : ''}`,
        code: ErrorCodeRegistry.EXPLORER_TLS_SECRET_CREATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Check existing secrets: kubectl get secrets -n <namespace>\n' +
          'Verify RBAC permissions allow secret creation\n' +
          'Re-deploy the explorer: solo explorer node add',
      },
      cause,
    );
  }
}
