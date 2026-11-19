// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when no usable StorageClass exists and the current user is not permitted to install the
 * bundled provisioner that would provide one.
 */
export class StorageClassInstallForbiddenSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(provisioner: string) {
    super({
      message:
        `No default StorageClass was found in the cluster and installing ${provisioner} was forbidden ` +
        '(the Kubernetes API denied creating its cluster-scoped resources).',
      code: ErrorCodeRegistry.STORAGE_CLASS_INSTALL_FORBIDDEN,
      troubleshootingSteps:
        "Run 'kubectl get storageclass' to list StorageClasses available in the cluster.\n" +
        'Pass an existing StorageClass via --pvc-storage-class <name>.\n' +
        'Or ask a cluster administrator to install a StorageClass, or to grant permission to create ' +
        'namespaces, StorageClasses and ClusterRoles.',
    });
  }
}
