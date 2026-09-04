// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubeMissingArgumentError extends KubeError {
  public readonly argumentDescription: string;

  public constructor(argumentDescription: string, cause?: Error) {
    super(argumentDescription, cause);
    this.argumentDescription = argumentDescription;
  }
}
