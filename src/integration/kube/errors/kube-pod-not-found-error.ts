// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubePodNotFoundError extends KubeError {
  public readonly resource: string;

  public constructor(resource: string, cause?: Error) {
    super(`No pod found for: ${resource}`, cause, {resource});
    this.resource = resource;
  }
}
