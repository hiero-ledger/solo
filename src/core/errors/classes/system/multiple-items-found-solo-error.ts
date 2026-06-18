// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Kubernetes lookup that expected a single resource matches more than one; the filters used
 * are attached to the error. solo expects these filtered lookups to be unique, so multiple matches indicate
 * an internal assumption was violated (for example over-broad filters), and it is treated as an internal
 * Solo error.
 */
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
