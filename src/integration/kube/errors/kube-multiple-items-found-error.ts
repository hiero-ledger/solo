// SPDX-License-Identifier: Apache-2.0

import {KubeError} from './kube-error.js';

export class KubeMultipleItemsFoundError extends KubeError {
  public readonly filters: Record<string, string>;

  public constructor(filters: Record<string, string>) {
    super('Multiple Kubernetes resources found matching the provided filters', undefined, {filters});
    this.filters = filters;
  }
}
