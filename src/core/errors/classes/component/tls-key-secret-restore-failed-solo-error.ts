// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot restore the consensus nodes' TLS keys from the shared Kubernetes secret back to
 * the local keys directory; when available the underlying failure is wrapped in `cause`. When `--debug` is off the
 * on-disk TLS keys are deleted after they are uploaded to the cluster, so later commands re-fetch them from the
 * secret — this means the secret could not be read or did not contain the expected key files (for example the
 * namespace or secret is missing, or the Kubernetes API rejected the request).
 */
export class TlsKeySecretRestoreFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(additionalMessage?: string, cause?: Error) {
    super(
      {
        message:
          'Failed to restore TLS keys from Kubernetes secret' + (additionalMessage ? `: ${additionalMessage}` : ''),
        code: ErrorCodeRegistry.TLS_KEY_SECRET_RESTORE_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Confirm the TLS key secret exists: kubectl get secret network-node-hapi-app-secrets -n <namespace>\n' +
          'Verify RBAC permissions allow reading secrets in the namespace',
      },
      cause,
    );
  }
}
