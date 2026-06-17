// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a component cannot be found during an operation; the message names the component id, its
 * type, and the operation attempted. solo expected the component to be present at this point, so its
 * absence indicates an internal inconsistency and is treated as an internal Solo error.
 */
export class ComponentNotFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(componentId: string, type: string, operation: string) {
    super({
      message: `Component '${componentId}' of type '${type}' not found while attempting to ${operation}`,
      code: ErrorCodeRegistry.COMPONENT_NOT_FOUND,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
