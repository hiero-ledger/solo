// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class UnknownComponentTypeSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Solo;

  public constructor(componentType: string, componentId?: string) {
    super({
      message: `Unknown component type '${componentType}'` + componentId ? ` for component id '${componentId}'` : '',
      code: ErrorCodeRegistry.UNKNOWN_COMPONENT_TYPE,
      troubleshootingSteps:
        'This is an internal Solo error. File a bug report: https://github.com/hiero-ledger/solo/issues',
    });
  }
}
