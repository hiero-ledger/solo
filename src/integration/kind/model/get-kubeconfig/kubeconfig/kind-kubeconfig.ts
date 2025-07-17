// SPDX-License-Identifier: Apache-2.0

import {type KindKubeConfigUser} from './kind-kubeconfig-user.js';
import {type KindKubeConfigCluster} from './kind-kubeconfig-custer.js';
import {type KindKubeConfigContext} from './kind-kubeconfig-context.js';

export class KindKubeConfig {
  public constructor(
    public readonly apiVersion: string,
    public readonly clusters: KindKubeConfigCluster[],
    public readonly contexts: KindKubeConfigContext[],
    public readonly currenctContext: string,
    public readonly kind: string,
    public readonly preferences: any,
    public readonly users: KindKubeConfigUser[],
  ) {}
}
