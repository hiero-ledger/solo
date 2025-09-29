// SPDX-License-Identifier: Apache-2.0

export class Metrics {
  public constructor(
    public readonly cpuInMillicores: number,
    public readonly memoryInMebibytes: number,
  ) {}
}
