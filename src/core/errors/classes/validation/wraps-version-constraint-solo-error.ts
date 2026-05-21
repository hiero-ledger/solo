// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class WrapsVersionConstraintSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(minimumVersion: string) {
    super({
      message: `"--wraps" requires consensus node >= ${minimumVersion}`,
      code: ErrorCodeRegistry.WRAPS_VERSION_CONSTRAINT,
      troubleshootingSteps:
        'Upgrade consensus node first: solo node upgrade --upgrade-version <minimumVersion>\nOr disable WRAPs: solo network deploy --wraps false',
    });
  }
}
