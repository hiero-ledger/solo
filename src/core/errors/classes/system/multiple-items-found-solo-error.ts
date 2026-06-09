// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class MultipleItemsFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(filters: Record<string, string>) {
    super(
      {
        message: 'Multiple Kubernetes resources found matching the provided filters',
        code: ErrorCodeRegistry.MULTIPLE_ITEMS_FOUND,
        troubleshootingSteps:
          'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
      },
      undefined,
      {filters},
    );
  }
}
