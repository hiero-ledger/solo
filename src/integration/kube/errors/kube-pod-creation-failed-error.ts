// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubePodCreationFailedError extends KubeError {
  public readonly result: unknown;

  public constructor(result?: unknown) {
    super('Failed to create Kubernetes pod', undefined, result === undefined ? undefined : {result});
    this.result = result;
  }
}
