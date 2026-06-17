// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no PersistentVolumeClaims are found in a namespace where they were expected; the message
 * names the namespace. Some operations require PVCs that are created only when persistent storage is
 * enabled at deployment, so this means PVCs were not enabled for the network — redeploy with PVCs enabled.
 */
export class NoPvcFoundSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(namespace: string) {
    super({
      message: `No PVCs found in namespace ${namespace}. Please ensure PVCs are enabled during network deployment`,
      code: ErrorCodeRegistry.NO_PVC_FOUND,
      troubleshootingSteps: 'Redeploy with PVCs enabled: solo consensus network deploy --pvcs true',
    });
  }
}
