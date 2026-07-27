// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a component being added already exists in the remote configuration; the message names the
 * component id. solo expects to add each component once, so a duplicate id at this point indicates an
 * internal bookkeeping defect and is treated as an internal Solo error.
 */
export class ComponentAlreadyExistsSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(componentId: string) {
    super({
      message: `Component '${componentId}' already exists in the remote configuration`,
      code: ErrorCodeRegistry.COMPONENT_ALREADY_EXISTS,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
