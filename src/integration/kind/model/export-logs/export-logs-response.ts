// SPDX-License-Identifier: Apache-2.0

export class ExportLogsResponse {
  private readonly _clusterName: string | undefined;
  private readonly _destinationPath: string | undefined;

  public constructor(protected readonly _rawOutput: string) {
    // Extract cluster name
    const clusterNameMatch: RegExpMatchArray | null = this._rawOutput.match(/Exporting logs for cluster "([^"]+)"/);
    this._clusterName = clusterNameMatch ? clusterNameMatch[1] : undefined;

    // Extract destination path
    const match: RegExpMatchArray = this._rawOutput.match(/to:\s*\n?([^\n]+)/);
    this._destinationPath = match ? match[1] : undefined;
  }

  public get clusterName(): string | undefined {
    return this._clusterName;
  }

  public get destinationPath(): string | undefined {
    return this._destinationPath;
  }
}
