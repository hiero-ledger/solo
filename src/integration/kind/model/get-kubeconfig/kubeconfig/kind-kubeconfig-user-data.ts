// SPDX-License-Identifier: Apache-2.0

export class KindKubeconfigUserData {
  constructor(
    public readonly clientCertificateData: string,
    public readonly clientKeyData: string,
  ) {}
}
