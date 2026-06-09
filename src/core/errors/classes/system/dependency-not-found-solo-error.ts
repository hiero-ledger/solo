// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class DependencyNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(dependency: string) {
    super({
      message: `Dependency '${dependency}' is not found`,
      code: ErrorCodeRegistry.DEPENDENCY_NOT_FOUND,
      troubleshootingSteps:
        `Install the missing dependency: ${dependency}\n` +
        'Run solo init to install all required dependencies: solo init\n' +
        `Verify the dependency is in your PATH: which ${dependency}`,
    });
  }
}
