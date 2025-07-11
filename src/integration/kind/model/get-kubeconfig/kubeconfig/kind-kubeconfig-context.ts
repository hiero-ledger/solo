// SPDX-License-Identifier: Apache-2.0

import {type KindKubeconfigContextData} from './kind-kubeconfig-context-data.js';

export class KindKubeconfigContext {
  constructor(
    public readonly context: KindKubeconfigContextData,
    public readonly name: string,
  ) {}
}
