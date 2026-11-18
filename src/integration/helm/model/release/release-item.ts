// SPDX-License-Identifier: Apache-2.0

export class ReleaseItem {
  public constructor(
    public readonly name: string,
    public readonly namespace: string,
    public readonly revision: string,
    public readonly updated: string,
    public readonly status: string,
    public readonly chart: string,
    public readonly app_version: string,
  ) {}

  /** Matches the version that `helm list` appends to the chart name: `<chart name>-<version>`. */
  private static readonly CHART_VERSION_SUFFIX: RegExp = /-(v?\d+\.\d+\.\d+(?:[+-][\w+.-]*)?)$/;

  /**
   * The version of the chart the release was installed from, parsed from {@link chart}.
   *
   * @returns the chart version, or undefined when {@link chart} does not end in a semantic version
   */
  public get chartVersion(): string | undefined {
    return ReleaseItem.CHART_VERSION_SUFFIX.exec(this.chart ?? '')?.[1];
  }
}
