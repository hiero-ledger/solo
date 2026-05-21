// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../../../core/errors/solo-errors.js';
import {type Clusters} from '../../../resources/cluster/clusters.js';
import {type Cluster, type KubeConfig} from '@kubernetes/client-node';

export class K8ClientClusters implements Clusters {
  public constructor(private readonly kubeConfig: KubeConfig) {
    if (!kubeConfig) {
      throw new SoloErrors.validation.illegalArgument('kubeConfig must not be null or undefined');
    }
  }

  public list(): string[] {
    const clusters: string[] = [];
    for (const cluster of this.kubeConfig.getClusters()) {
      clusters.push(cluster.name);
    }

    return clusters;
  }

  public readCurrent(): string {
    const currentCluster: Cluster = this.kubeConfig.getCurrentCluster();
    return currentCluster ? currentCluster.name : '';
  }
}
