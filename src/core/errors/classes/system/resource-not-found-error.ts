// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {BUG_REPORT_URL} from '../../../constants.js';

export class ResourceNotFoundError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(resource: string, cause: Error | any = {}) {
    super(
      {
        message: `Resource not found: ${resource}`,
        code: ErrorCodeRegistry.RESOURCE_NOT_FOUND,
        troubleshootingSteps: `Make sure the requested resource exists and is reachable, if not file a bug report: ${BUG_REPORT_URL}`,
      },
      cause,
      {resource},
    );
  }
}
