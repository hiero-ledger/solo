// SPDX-License-Identifier: Apache-2.0

export class LoadDockerImageResponse {
  private readonly _imageName: string;
  private readonly _imageId: string;

  public constructor(protected readonly _rawOutput: string) {
    const imageMatch: RegExpMatchArray = this._rawOutput.match(/Image:\s*"([^"]+)"\s+with\s+ID\s*"([^"]+)"/);
    this._imageName = imageMatch?.[1];
    this._imageId = imageMatch?.[2];
  }

  public get imageName(): string {
    return this._imageName;
  }

  public get imageId(): string {
    return this._imageId;
  }
}
