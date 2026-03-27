// SPDX-License-Identifier: Apache-2.0

export class KindVersion {
  private readonly _version: SemanticVersion<string>;

  public constructor(response: string) {
    // extract the version from the response string
    // expected response looks like "kind v0.27.0 go1.24.0 darwin/arm64"
    const match: RegExpMatchArray = response.match(/v(\d+\.\d+\.\d+)/);
    const version: string = match ? match[1] : null;
    this._version = new SemanticVersion<string>(version);
  }

  public getVersion(): SemanticVersion<string> {
    return this._version;
  }
}
