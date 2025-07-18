// SPDX-License-Identifier: Apache-2.0

export class KindKubeConfigUserData {
  public constructor(
    public readonly clientCertificateData: string,
    public readonly clientKeyData: string,
  ) {}
}
