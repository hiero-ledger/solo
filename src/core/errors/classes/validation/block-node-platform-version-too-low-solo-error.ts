// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class BlockNodePlatformVersionTooLowSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(currentVersion: string, minimumVersion: string) {
    super({
      message: `Current consensus node version ${currentVersion} is below the minimum required ${minimumVersion} for block node deployment`,
      code: ErrorCodeRegistry.BLOCK_NODE_PLATFORM_VERSION_TOO_LOW,
      troubleshootingSteps:
        `Upgrade your consensus node to at least version ${minimumVersion} before deploying block nodes\n` +
        'Check the current consensus node version: solo deployment config info\n' +
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log',
    });
  }
}
