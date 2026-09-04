// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo relay node upgrade` cannot upgrade the JSON-RPC relay; the underlying failure is
 * wrapped in `cause`. Upgrade re-applies the relay Helm release at a new chart or version, so this means
 * the upgrade did not succeed — for example a Helm failure, an image that cannot be pulled, or
 * misconfigured values.
 */
export class RelayUpgradeFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error upgrading relay: ${cause.message}`,
        code: ErrorCodeRegistry.RELAY_UPGRADE_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect Helm release: helm status <release> -n <namespace>\n' +
          'View relay pod logs: kubectl logs -n <namespace> <relay-pod>',
      },
      cause,
    );
  }
}
