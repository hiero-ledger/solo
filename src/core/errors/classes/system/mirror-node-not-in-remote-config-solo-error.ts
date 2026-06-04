// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {Flags} from '../../../../commands/flags.js';

export class MirrorNodeNotInRemoteConfigSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'Mirror node not found in remote config',
      code: ErrorCodeRegistry.MIRROR_NODE_NOT_IN_REMOTE_CONFIG,
      troubleshootingSteps:
        'List components in remote config: solo deployment config info\n' +
        `Deploy the mirror node first: solo mirror node add ${Flags.getFormattedFlagKey(Flags.deployment)} <deployment>`,
    });
  }
}
