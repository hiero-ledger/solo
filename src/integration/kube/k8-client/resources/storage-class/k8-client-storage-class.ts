// SPDX-License-Identifier: Apache-2.0

import {type StorageClass} from '../../../resources/storage-class/storage-class.js';

export class K8ClientStorageClass implements StorageClass {
  public constructor(
    public readonly name: string,
    public readonly provisioner: string,
    public readonly isDefault: boolean,
  ) {}
}
