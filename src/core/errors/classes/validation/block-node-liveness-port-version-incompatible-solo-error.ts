// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the consensus platform version is too low for the requested block node version liveness-check
 * port; the message names the platform version, the minimum required, and the block node version. A newer
 * block node changed its liveness port, so this means the deployed platform predates that change — use a
 * compatible platform and block-node version combination.
 */
export class BlockNodeLivenessPortVersionIncompatibleSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(platformVersion: string, minimumPlatformVersion: string, blockNodeVersion: string) {
    super({
      message: `Platform version ${platformVersion} is below ${minimumPlatformVersion} required for block node version ${blockNodeVersion} (liveness check port change)`,
      code: ErrorCodeRegistry.BLOCK_NODE_LIVENESS_PORT_VERSION_INCOMPATIBLE,
      troubleshootingSteps:
        `Upgrade your consensus node to at least version ${minimumPlatformVersion}\n` +
        `Or use a block node chart version below ${blockNodeVersion}`,
    });
  }
}
