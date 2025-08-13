// SPDX-License-Identifier: Apache-2.0

import {type KindKubeConfigContextData} from './kind-kubeconfig-context-data.js';

export class KindKubeConfigContext {
  public constructor(
    public readonly context: KindKubeConfigContextData,
    public readonly name: string,
  ) {}
}
