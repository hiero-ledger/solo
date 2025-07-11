// SPDX-License-Identifier: Apache-2.0

import {type KindKubeconfigClusterData} from './kind-kubeconfig-custer-data.js';

export class KindKubeconfigCluster {
  constructor(
    public readonly cluster: KindKubeconfigClusterData,
    public readonly name: string,
  ) {}
}
