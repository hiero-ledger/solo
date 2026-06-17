// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubeApiInvalidResponseError extends KubeError {
  public constructor() {
    super('Received an incorrect or unexpected response from the Kubernetes API');
  }
}
