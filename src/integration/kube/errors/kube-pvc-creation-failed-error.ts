// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubePvcCreationFailedError extends KubeError {
  public constructor() {
    super('Failed to create PersistentVolumeClaim');
  }
}
