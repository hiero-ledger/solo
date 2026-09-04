// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubeContainerInvalidPathError extends KubeError {
  public readonly context: string;
  public readonly path: string;

  public constructor(context: string, path: string) {
    super(`Invalid container path in ${context}: ${path}`, undefined, {context, path});
    this.context = context;
    this.path = path;
  }
}
