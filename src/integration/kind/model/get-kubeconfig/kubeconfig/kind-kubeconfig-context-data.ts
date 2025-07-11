// SPDX-License-Identifier: Apache-2.0

export class KindKubeconfigContextData {
  constructor(
    public readonly cluster: string,
    public readonly user: string,
  ) {}
}
