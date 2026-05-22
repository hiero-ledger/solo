// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';
import {BUG_REPORT_URL} from '../../../constants.js';

export class DataValidationError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(context: string, expected: any, found: any, cause: Error | any = {}) {
    super(
      {
        message: `Data validation failed: ${context} (expected: ${JSON.stringify(expected)}, found: ${JSON.stringify(found)})`,
        code: ErrorCodeRegistry.DATA_VALIDATION,
        troubleshootingSteps: `This is an internal Solo error. File a bug report: ${BUG_REPORT_URL}`,
      },
      cause,
      {expected, found},
    );
  }
}
