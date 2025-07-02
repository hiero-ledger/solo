// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import {KindDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';

describe('KindDependencyManager', () => {
  const temporaryDirectory = PathEx.join(getTemporaryDirectory(), 'bin');

  before(() => fs.mkdirSync(temporaryDirectory));

  after(() => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  it('should return kind version', () => {
    const kindDependencyManager = new KindDependencyManager(undefined, undefined, temporaryDirectory);
    expect(kindDependencyManager.getKindVersion()).to.equal(version.KIND_VERSION);
  });

  it('should be able to check when kind not installed', () => {
    const kindDependencyManager = new KindDependencyManager(undefined, undefined, temporaryDirectory);
    expect(kindDependencyManager.isInstalled()).not.to.be.ok;
  });

  it('should be able to check when kind is installed', () => {
    const kindDependencyManager = new KindDependencyManager(undefined, undefined, temporaryDirectory);
    fs.writeFileSync(kindDependencyManager.getKindPath(), '');
    expect(kindDependencyManager.isInstalled()).to.be.ok;
  });

  describe('Kind Installation Tests', () => {
    each([
      ['linux', 'x64'],
      ['linux', 'amd64'],
      ['windows', 'amd64'],
    ]).it('should be able to install kind base on %s and %s', async (osPlatform: any, osArch: string) => {
      const kindDependencyManager = new KindDependencyManager(
        undefined,
        undefined,
        temporaryDirectory,
        osPlatform,
        osArch,
      );

      if (fs.existsSync(temporaryDirectory)) {
        fs.rmSync(temporaryDirectory, {recursive: true});
      }

      kindDependencyManager.uninstall();
      expect(kindDependencyManager.isInstalled()).not.to.be.ok;

      expect(await kindDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(kindDependencyManager.isInstalled()).to.be.ok;

      fs.rmSync(temporaryDirectory, {recursive: true});
    });
  });
});
