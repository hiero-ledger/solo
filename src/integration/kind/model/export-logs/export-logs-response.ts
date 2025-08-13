// SPDX-License-Identifier: Apache-2.0

export class ExportLogsResponse {
  private readonly _exportPath: string | undefined;

  public constructor(protected readonly _rawOutput: string) {
    // Extract destination path
    this._exportPath = _rawOutput;
  }

  public get exportPath(): string | undefined {
    return this._exportPath;
  }
}
