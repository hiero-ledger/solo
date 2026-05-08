// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './errors/solo-error.js';
import * as constants from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type K8} from '../integration/kube/k8.js';
import {type StorageClass} from '../integration/kube/resources/storage-class/storage-class.js';
import {PathEx} from '../business/utils/path-ex.js';

export class StorageClassHelper {
  /**
   * Resolves the StorageClass name to use for PersistentVolumeClaims.
   *
   * Always returns a concrete class name. When userSuppliedClass is non-empty it is validated
   * against the cluster and returned. When empty, the cluster is inspected in order:
   * 1. Cluster default StorageClass (annotated with is-default-class=true).
   * 2. A StorageClass backed by LOCAL_PATH_PROVISIONER (common on Kind clusters).
   * 3. Install LOCAL_PATH_PROVISIONER from the bundled manifest, mark it as the cluster default,
   *    then return LOCAL_PATH_STORAGE_CLASS.
   */
  public static async resolveStorageClass(k8: K8, logger: SoloLogger, userSuppliedClass: string): Promise<string> {
    const storageClasses: StorageClass[] = await k8.storageClasses().list();

    if (userSuppliedClass) {
      const found: StorageClass | undefined = storageClasses.find(
        (storageClass: StorageClass): boolean => storageClass.name === userSuppliedClass,
      );
      if (!found) {
        const available: string = storageClasses
          .map((storageClass: StorageClass): string => storageClass.name)
          .join(', ');
        throw new SoloError(
          `StorageClass '${userSuppliedClass}' not found in cluster.` +
            (available ? ` Available classes: ${available}` : ' No StorageClasses are installed.'),
        );
      }
      return userSuppliedClass;
    }

    const defaultClass: StorageClass | undefined = storageClasses.find(
      (storageClass: StorageClass): boolean => storageClass.isDefault,
    );
    if (defaultClass) {
      logger.debug(`Using default StorageClass: ${defaultClass.name}`);
      return defaultClass.name;
    }

    const localPathClass: StorageClass | undefined = storageClasses.find(
      (storageClass: StorageClass): boolean => storageClass.provisioner === constants.LOCAL_PATH_PROVISIONER,
    );
    if (localPathClass) {
      logger.debug(`Using existing ${constants.LOCAL_PATH_PROVISIONER} StorageClass: ${localPathClass.name}`);
      return localPathClass.name;
    }

    const manifestPath: string = PathEx.joinWithRealPath(constants.RESOURCES_DIR, 'local-path-provisioner.yaml');
    logger.showUser(
      `No StorageClass found in cluster — installing ${constants.LOCAL_PATH_PROVISIONER}-provisioner. ` +
        'Use --pvc-storage-class to specify an existing StorageClass.',
    );
    await k8.manifests().applyManifest(manifestPath, {ignoreExisting: true});
    await k8.manifests().patchObject({
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: {
        name: constants.LOCAL_PATH_STORAGE_CLASS,
        annotations: {'storageclass.kubernetes.io/is-default-class': 'true'},
      },
    });
    return constants.LOCAL_PATH_STORAGE_CLASS;
  }
}
