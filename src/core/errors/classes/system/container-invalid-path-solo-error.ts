// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo is given an invalid path for a container operation; the message names the context and
 * the path. solo validates container paths before using them for copy or exec operations, so an invalid
 * value here (for example an empty or malformed path passed internally) points to a defect in the calling
 * code and is treated as an internal Solo error.
 */
export class ContainerInvalidPathSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(context: string, path: string) {
    super({
      message: `Invalid container path in ${context}: ${path}`,
      code: ErrorCodeRegistry.CONTAINER_INVALID_PATH,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
