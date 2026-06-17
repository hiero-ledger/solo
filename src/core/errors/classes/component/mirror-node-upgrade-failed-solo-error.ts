// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `solo mirror node upgrade` cannot upgrade the mirror node; the underlying failure is wrapped
 * in `cause`. Upgrade re-applies the mirror node Helm release at a new chart or version, so this means the
 * upgrade did not succeed — for example a Helm failure, an image that cannot be pulled, or misconfigured
 * values.
 */
export class MirrorNodeUpgradeFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(cause: Error) {
    super(
      {
        message: `Error upgrading mirror node: ${cause.message}`,
        code: ErrorCodeRegistry.MIRROR_NODE_UPGRADE_FAILED,
        troubleshootingSteps:
          'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
          'Inspect Helm release: helm status <release> -n <namespace>\n' +
          'View mirror node pod logs: kubectl logs -n <namespace> <mirror-pod>',
      },
      cause,
    );
  }
}
