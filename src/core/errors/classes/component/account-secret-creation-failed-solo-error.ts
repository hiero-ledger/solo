// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot store an account's key material as a Kubernetes secret; the message names the
 * account. After creating or updating an account, solo persists its keys in a cluster secret so other
 * components can use them, so this is raised when that secret cannot be created — for example the namespace
 * is missing, a conflicting secret exists, or the Kubernetes API rejected the request.
 */
export class AccountSecretCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(accountId: string, cause?: Error) {
    super(
      {
        message: `Failed to create Kubernetes secret for account ${accountId}`,
        code: ErrorCodeRegistry.ACCOUNT_SECRET_CREATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify Kubernetes connectivity: kubectl get pods -n <namespace>\n' +
          'Check existing secrets: kubectl get secrets -n <namespace>\n' +
          'Verify RBAC permissions allow secret creation',
      },
      cause,
    );
  }
}
