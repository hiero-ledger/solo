// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubeIllegalArgumentError extends KubeError {
  public readonly reason: string;

  public constructor(reason: string, cause?: Error) {
    super(reason, cause);
    this.reason = reason;
  }
}
