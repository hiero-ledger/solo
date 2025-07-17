// SPDX-License-Identifier: Apache-2.0

import {SemVer} from 'semver';

export class KindVersion {
  private readonly _version: SemVer;

  constructor(response: string) {
    // extract the version from the response string
    // expected response looks like "kind v0.27.0 go1.24.0 darwin/arm64"
    const match = response.match(/v(\d+\.\d+\.\d+)/);
    const version = match ? match[1] : null;
    this._version = new SemVer(version);
  }

  getVersion(): SemVer {
    return this._version;
  }
}
