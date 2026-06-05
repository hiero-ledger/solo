// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class PathTraversalDetectedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(resolvedPath: string, resolvedBase: string) {
    super({
      message: `Path traversal detected: ${resolvedPath} is outside the allowed base directory ${resolvedBase}`,
      code: ErrorCodeRegistry.PATH_TRAVERSAL_DETECTED,
      troubleshootingSteps:
        'Provide a path that is within the allowed base directory\n' +
        'Avoid using ".." path components that escape the base directory',
    });
  }
}
