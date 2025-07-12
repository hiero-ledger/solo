// SPDX-License-Identifier: Apache-2.0

import {type KindKubeconfigUser} from './kind-kubeconfig-user.js';
import {type KindKubeconfigCluster} from './kind-kubeconfig-custer.js';
import {type KindKubeconfigContext} from './kind-kubeconfig-context.js';

export class KindKubeconfig {
  public constructor(
    public readonly apiVersion: string,
    public readonly clusters: KindKubeconfigCluster[],
    public readonly contexts: KindKubeconfigContext[],
    public readonly currenctContext: string,
    public readonly kind: string,
    public readonly preferences: any,
    public readonly users: KindKubeconfigUser[],
  ) {}
}
