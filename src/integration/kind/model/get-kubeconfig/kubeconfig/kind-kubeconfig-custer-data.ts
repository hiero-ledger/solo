// SPDX-License-Identifier: Apache-2.0

export class KindKubeconfigClusterData {
  public constructor(
    public readonly certificateAuthorityData: string,
    public readonly server: string,
  ) {}
}
