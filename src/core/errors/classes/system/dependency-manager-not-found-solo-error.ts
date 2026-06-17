// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no dependency manager is registered for a requested dependency; the message names the
 * dependency. solo routes each managed dependency to a registered manager that knows how to install and
 * verify it, so a missing registration points to an internal wiring defect and is treated as an internal
 * Solo error.
 */
export class DependencyManagerNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(dependency: string) {
    super({
      message: `Dependency manager for '${dependency}' is not registered`,
      code: ErrorCodeRegistry.DEPENDENCY_MANAGER_NOT_FOUND,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
