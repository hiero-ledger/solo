// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';

export class NodeVersionMismatchSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(savedVersion: string, requestedVersion: string) {
    super({
      message: `Consensus node version saved in remote config ${savedVersion} is different from ${requestedVersion}`,
      code: ErrorCodeRegistry.NODE_VERSION_MISMATCH,
      troubleshootingSteps:
        `Check the saved version: solo deployment config info ${Flags.getFormattedFlagKey(Flags.deployment)} <name>\n` +
        `Use the same version: solo consensus node setup ${Flags.getFormattedFlagKey(Flags.releaseTag)} <savedVersion>\n` +
        `Or upgrade the network first: solo consensus network upgrade ${Flags.getFormattedFlagKey(Flags.upgradeVersion)} <version>`,
    });
  }
}
