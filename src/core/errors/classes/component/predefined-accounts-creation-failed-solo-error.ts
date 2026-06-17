// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo fails to create the set of predefined accounts it seeds into a new network; the
 * underlying failure is wrapped in `cause`. These accounts are created during setup to provide ready-to-use
 * funded accounts, so this means one of those creations did not succeed — commonly a network rejection, a
 * signing or key problem, or an unreachable consensus node.
 */
export class PredefinedAccountsCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Failed to create predefined accounts: ${cause.message}`,
        code: ErrorCodeRegistry.PREDEFINED_ACCOUNTS_CREATION_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Verify consensus nodes are running: kubectl get pods -n <namespace>\n' +
          'Check node logs for errors: kubectl logs <node-pod> -n <namespace>',
      },
      cause,
    );
  }
}
