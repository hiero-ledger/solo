// SPDX-License-Identifier: Apache-2.0

import {type StorageV1Api, type V1StorageClass, type V1StorageClassList} from '@kubernetes/client-node';
import {type StorageClasses} from '../../../resources/storage-class/storage-classes.js';
import {type StorageClass} from '../../../resources/storage-class/storage-class.js';
import {K8ClientStorageClass} from './k8-client-storage-class.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';

const DEFAULT_CLASS_ANNOTATION: string = 'storageclass.kubernetes.io/is-default-class';

export class K8ClientStorageClasses implements StorageClasses {
  public constructor(private readonly storageApi: StorageV1Api) {}

  public async list(): Promise<StorageClass[]> {
    try {
      const response: V1StorageClassList = await this.storageApi.listStorageClass();
      const storageClasses: StorageClass[] = [];

      if (response?.items?.length > 0) {
        for (const item of response.items as V1StorageClass[]) {
          const isDefault: boolean = item.metadata?.annotations?.[DEFAULT_CLASS_ANNOTATION] === 'true';
          storageClasses.push(new K8ClientStorageClass(item.metadata?.name ?? '', item.provisioner ?? '', isDefault));
        }
      }

      return storageClasses;
    } catch (error) {
      throw new SoloError('Failed to list StorageClasses', error);
    }
  }
}
