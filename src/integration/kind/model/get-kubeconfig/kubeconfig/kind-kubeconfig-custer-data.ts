// SPDX-License-Identifier: Apache-2.0

export class KindKubeConfigClusterData {
  public constructor(
    public readonly certificateAuthorityData: string,
    public readonly server: string,
  ) {}
}
