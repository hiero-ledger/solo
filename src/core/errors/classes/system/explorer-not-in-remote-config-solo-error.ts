// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class ExplorerNotInRemoteConfigSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'No explorer component found in remote config',
      code: ErrorCodeRegistry.EXPLORER_NOT_IN_REMOTE_CONFIG,
      troubleshootingSteps:
        'List components in remote config: solo deployment config info\n' +
        'Deploy the explorer first: solo explorer deploy',
    });
  }
}
