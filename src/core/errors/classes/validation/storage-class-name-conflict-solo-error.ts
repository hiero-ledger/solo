// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the StorageClass name Solo needs for its bundled provisioner is already taken in the
 * cluster by a StorageClass that is backed by a different provisioner.
 */
export class StorageClassNameConflictSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(storageClass: string, existingProvisioner: string, expectedProvisioner: string) {
    super({
      message:
        `StorageClass '${storageClass}' already exists in the cluster with provisioner '${existingProvisioner}', ` +
        `but Solo needs that name for provisioner '${expectedProvisioner}'.`,
      code: ErrorCodeRegistry.STORAGE_CLASS_NAME_CONFLICT,
      troubleshootingSteps:
        "Run 'kubectl get storageclass' to list StorageClasses available in the cluster.\n" +
        'Pass an existing StorageClass via: solo consensus network deploy --pvc-storage-class <name>\n' +
        `Or remove the conflicting StorageClass if it is not in use: kubectl delete storageclass ${storageClass}`,
    });
  }
}
