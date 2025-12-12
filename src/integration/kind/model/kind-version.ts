// SPDX-License-Identifier: Apache-2.0

import {SemVer} from 'semver';

export class KindVersion {
  private readonly _version: SemVer;

  public constructor(response: string) {
    // extract the version from the response string
    // expected response looks like "kind v0.27.0 go1.24.0 darwin/arm64"
    const match: RegExpMatchArray = response.match(/v(\d+\.\d+\.\d+)/);
    const version: string = match ? match[1] : null;
    this._version = new SemVer(version);
  }

  public getVersion(): SemVer {
    return this._version;
  }
}
