// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

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
