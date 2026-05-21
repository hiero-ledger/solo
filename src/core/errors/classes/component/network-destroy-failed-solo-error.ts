// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class NetworkDestroyFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error destroying network: ${cause.message}`,
        code: ErrorCodeRegistry.NETWORK_DESTROY_FAILED,
        troubleshootingSteps:
          'Check remaining Helm releases: helm list -A\nCheck for stuck namespaces: kubectl get namespaces\nManually clean up: helm uninstall <chart> -n <namespace>\nReview logs: tail -f ~/.solo/logs/solo.log | jq',
      },
      cause,
    );
  }
}
