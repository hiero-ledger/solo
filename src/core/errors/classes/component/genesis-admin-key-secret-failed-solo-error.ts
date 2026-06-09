// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class GenesisAdminKeySecretFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(accountId: string) {
    super({
      message: `Failed to create Kubernetes secret for admin key of account ${accountId}`,
      code: ErrorCodeRegistry.GENESIS_ADMIN_KEY_SECRET_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Check existing secrets: kubectl get secrets -n <namespace>\n' +
        'Verify RBAC permissions allow secret creation\n' +
        'Redeploy the network: solo consensus network deploy',
    });
  }
}
