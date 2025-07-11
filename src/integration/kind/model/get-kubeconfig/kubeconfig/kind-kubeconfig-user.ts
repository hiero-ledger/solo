// SPDX-License-Identifier: Apache-2.0

import {type KindKubeconfigUserData} from './kind-kubeconfig-user-data.js';

export class KindKubeconfigUser {
  constructor(
    public readonly user: KindKubeconfigUserData,
    public readonly name: string,
  ) {}
}
