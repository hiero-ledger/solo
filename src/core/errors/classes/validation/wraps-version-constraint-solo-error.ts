// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when `--wraps` is used with a consensus node version below the minimum required; the message names
 * the minimum version. WRAPs support requires a sufficiently new node version, so this means the selected
 * version is too old.
 */
export class WrapsVersionConstraintSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(minimumVersion: string) {
    super({
      message: `"--wraps" requires consensus node >= ${minimumVersion}`,
      code: ErrorCodeRegistry.WRAPS_VERSION_CONSTRAINT,
      troubleshootingSteps:
        'Upgrade consensus node first: solo consensus network upgrade --upgrade-version <minimumVersion>\n' +
        'Or disable WRAPs: solo consensus network deploy --wraps false',
    });
  }
}
