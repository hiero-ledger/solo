// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot create the TLS certificate secret for a consensus node; the message names the
 * node alias. solo stores node certificates as Kubernetes secrets so they can be mounted, so this means the
 * secret could not be created — for example the namespace is missing, a conflicting secret exists, or the
 * Kubernetes API rejected the request.
 */
export class CertificateSecretCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(nodeAlias: string, cause?: Error) {
    super(
      {
        message: `Failed to create TLS certificate secret for node '${nodeAlias}'`,
        code: ErrorCodeRegistry.CERTIFICATE_SECRET_CREATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Check existing secrets: kubectl get secrets -n <namespace>\n' +
          'Verify RBAC permissions allow secret creation\n' +
          'Re-run node setup: solo consensus node setup',
      },
      cause,
    );
  }
}
