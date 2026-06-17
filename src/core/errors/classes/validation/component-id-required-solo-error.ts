// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a component id is required but was not provided; the message echoes the value. solo needs an
 * id to locate or record a component, so a missing value passed internally points to a defect in the
 * calling code and is treated as an internal Solo error.
 */
export class ComponentIdRequiredSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(componentId: string) {
    super({
      message: `Component ID is required but was not provided: ${componentId}`,
      code: ErrorCodeRegistry.COMPONENT_ID_REQUIRED,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
