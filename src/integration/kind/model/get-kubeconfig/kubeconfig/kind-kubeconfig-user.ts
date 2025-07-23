// SPDX-License-Identifier: Apache-2.0

import {type KindKubeConfigUserData} from './kind-kubeconfig-user-data.js';

export class KindKubeConfigUser {
  public constructor(
    public readonly user: KindKubeConfigUserData,
    public readonly name: string,
  ) {}
}
