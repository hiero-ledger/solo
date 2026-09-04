// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {getSoloVersion} from '../../version.js';
import {type Version} from '../../src/types/index.js';

describe('getSoloVersion', (): void => {
  const fileName: string = fileURLToPath(import.meta.url);
  const directoryName: string = path.dirname(fileName);
  const rootPackageJsonPath: string = path.resolve(directoryName, '../../package.json');
  const expectedVersion: Version = (JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8')) as {version: Version})
    .version;

  let originalNpmPackageVersion: string | undefined;

  beforeEach((): void => {
    originalNpmPackageVersion = process.env.npm_package_version;
  });

  afterEach((): void => {
    if (originalNpmPackageVersion === undefined) {
      delete process.env.npm_package_version;
    } else {
      process.env.npm_package_version = originalNpmPackageVersion;
    }
  });

  it('ignores npm_package_version set by a consuming Node.js project', (): void => {
    process.env.npm_package_version = '99.99.99';
    const version: Version = getSoloVersion();
    expect(version).to.not.equal('99.99.99');
    expect(version).to.equal(expectedVersion);
  });

  it('reads the version from package.json when npm_package_version is unset', (): void => {
    delete process.env.npm_package_version;
    expect(getSoloVersion()).to.equal(expectedVersion);
  });
});
