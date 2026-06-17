// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when solo cannot create a PersistentVolumeClaim. solo provisions PVCs for components that need
 * persistent storage, so this means the create request failed — for example the API rejected the spec, or
 * no StorageClass could satisfy it.
 */
export class PvcCreationFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor() {
    super({
      message: 'Failed to create PersistentVolumeClaim',
      code: ErrorCodeRegistry.PVC_CREATION_FAILED,
      troubleshootingSteps:
        'Check solo logs: tail -n 100 ~/.solo/logs/solo.log\n' +
        'Verify available storage in the cluster: kubectl get pv\n' +
        'Check if a StorageClass is configured: kubectl get storageclass\n' +
        'Inspect PVC events: kubectl describe pvc -n <namespace>',
    });
  }
}
