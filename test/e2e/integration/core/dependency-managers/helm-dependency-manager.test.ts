// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import {HelmDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';

describe('HelmDependencyManager', () => {
  const temporaryDirectory = PathEx.join(getTemporaryDirectory(), 'bin');

  before(() => fs.mkdirSync(temporaryDirectory));

  after(() => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  it('should return helm version', () => {
    const helmDependencyManager = new HelmDependencyManager(undefined, undefined, temporaryDirectory);
    expect(helmDependencyManager.getHelmVersion()).to.equal(version.HELM_VERSION);
  });

  it('should be able to check when helm not installed', () => {
    const helmDependencyManager = new HelmDependencyManager(undefined, undefined, temporaryDirectory);
    expect(helmDependencyManager.isInstalled()).not.to.be.ok;
  });

  it('should be able to check when helm is installed', () => {
    const helmDependencyManager = new HelmDependencyManager(undefined, undefined, temporaryDirectory);
    fs.writeFileSync(helmDependencyManager.getHelmPath(), '');
    expect(helmDependencyManager.isInstalled()).to.be.ok;
  });

  describe('Helm Installation Tests', () => {
    each([
      ['linux', 'x64'],
      ['linux', 'amd64'],
      ['windows', 'amd64'],
    ]).it('should be able to install helm base on %s and %s', async (osPlatform: any, osArch: string) => {
      const helmDependencyManager = new HelmDependencyManager(
        undefined,
        undefined,
        temporaryDirectory,
        osPlatform,
        osArch,
      );

      if (fs.existsSync(temporaryDirectory)) {
        fs.rmSync(temporaryDirectory, {recursive: true});
      }

      helmDependencyManager.uninstall();
      expect(helmDependencyManager.isInstalled()).not.to.be.ok;

      expect(await helmDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(helmDependencyManager.isInstalled()).to.be.ok;

      fs.rmSync(temporaryDirectory, {recursive: true});
    });
  });
});
