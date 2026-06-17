// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when an expected resource cannot be found; the message names the resource and, when available,
 * wraps the underlying `cause`. solo looks up Kubernetes and related resources by name as it works, so this
 * means the resource was absent where it was expected — for example it was not yet created, was deleted, or
 * was searched for in the wrong place.
 */
export class ResourceNotFoundError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(resource: string, cause?: Error) {
    super(
      {
        message: `Resource not found: ${resource}`,
        code: ErrorCodeRegistry.RESOURCE_NOT_FOUND,
        troubleshootingSteps: `Make sure the requested resource exists and is reachable, if not file a bug report: ${SoloError.bugReportUrl}`,
      },
      cause,
      {resource},
    );
  }
}
