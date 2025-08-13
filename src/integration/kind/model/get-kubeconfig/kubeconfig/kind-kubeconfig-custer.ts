// SPDX-License-Identifier: Apache-2.0

import {type KindKubeConfigClusterData} from './kind-kubeconfig-custer-data.js';

export class KindKubeConfigCluster {
  public constructor(
    public readonly cluster: KindKubeConfigClusterData,
    public readonly name: string,
  ) {}
}
