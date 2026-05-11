// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {SoloError} from './errors/solo-error.js';
import * as constants from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type K8} from '../integration/kube/k8.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type StorageClass} from '../integration/kube/resources/storage-class/storage-class.js';
import {PathEx} from '../business/utils/path-ex.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {patchInject} from './dependency-injection/container-helper.js';

@injectable()
export class StorageClassHelper {
  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

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
  public async resolveStorageClass(context: string, userSuppliedClass: string): Promise<string> {
    const k8: K8 = this.k8Factory.getK8(context);
    const storageClasses: StorageClass[] = await k8.storageClasses().list();

    if (userSuppliedClass) {
      return this.validateUserClass(storageClasses, userSuppliedClass);
    }

    const defaultClass: StorageClass | undefined = storageClasses.find(
      (storageClass: StorageClass): boolean => storageClass.isDefault,
    );
    if (defaultClass) {
      this.logger.debug(`Using default StorageClass: ${defaultClass.name}`);
      return defaultClass.name;
    }

    const localPathClass: StorageClass | undefined = storageClasses.find(
      (storageClass: StorageClass): boolean => storageClass.provisioner === constants.LOCAL_PATH_PROVISIONER,
    );
    if (localPathClass) {
      this.logger.debug(
        `Setting existing ${constants.LOCAL_PATH_PROVISIONER} StorageClass as cluster default: ${localPathClass.name}`,
      );
      await this.setAsClusterDefault(k8, localPathClass.name);
      return localPathClass.name;
    }

    const installedName: string = await this.installLocalPath(k8);
    await this.setAsClusterDefault(k8, installedName);
    return installedName;
  }

  private validateUserClass(storageClasses: StorageClass[], userSuppliedClass: string): string {
    if (!storageClasses.some((storageClass: StorageClass): boolean => storageClass.name === userSuppliedClass)) {
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

  private async installLocalPath(k8: K8): Promise<string> {
    const manifestPath: string = PathEx.joinWithRealPath(constants.RESOURCES_DIR, 'local-path-provisioner.yaml');
    this.logger.showUser(
      `No StorageClass found in cluster — installing ${constants.LOCAL_PATH_PROVISIONER}-provisioner. ` +
        'Use --pvc-storage-class to specify an existing StorageClass.',
    );
    await k8.manifests().applyManifest(manifestPath, {ignoreExisting: true});
    return constants.LOCAL_PATH_STORAGE_CLASS;
  }

  private async setAsClusterDefault(k8: K8, name: string): Promise<void> {
    await k8.manifests().patchObject({
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: {
        name,
        annotations: {'storageclass.kubernetes.io/is-default-class': 'true'},
      },
    });
  }
}
