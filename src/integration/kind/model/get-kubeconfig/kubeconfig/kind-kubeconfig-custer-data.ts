// SPDX-License-Identifier: Apache-2.0

export class KindKubeconfigClusterData {
  constructor(
    public readonly certificateAuthorityData: string,
    public readonly server: string,
  ) {}
}
