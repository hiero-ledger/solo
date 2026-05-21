// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

export class PvcFlagNotEnabledSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor() {
    super({
      message: 'PVCs flag is not enabled. Please enable PVCs before adding a node',
      code: ErrorCodeRegistry.PVC_FLAG_NOT_ENABLED,
      troubleshootingSteps:
        'Redeploy with PVCs enabled: solo network deploy --pvcs true\n' +
        'Check the current deployment configuration: solo deployment config info --deployment <name>\n' +
        'PVCs are required for node add operations to persist state across pod restarts',
    });
  }
}
