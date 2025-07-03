// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import {KindDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import sinon from 'sinon';

describe('KindDependencyManager', () => {
  const temporaryDirectory = PathEx.join(getTemporaryDirectory(), 'bin');

  before(() => fs.mkdirSync(temporaryDirectory));

  after(() => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  it('should return kind version', () => {
    const kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory);
    expect(kindDependencyManager.getKindVersion()).to.equal(version.KIND_VERSION);
  });

  it('should be able to check when kind not installed', () => {
    const kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory);
    expect(kindDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when kind is installed', () => {
    const kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory);
    fs.writeFileSync(kindDependencyManager.getKindPath(), '');
    expect(kindDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('when kind is installed globally', () => {
    let kindDependencyManager: KindDependencyManager;
    let runStub: sinon.SinonStub;

    beforeEach(() => {
      kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory, process.platform, process.arch);
      kindDependencyManager.uninstallLocal();
      runStub = sinon.stub(kindDependencyManager, 'run');
    });

    afterEach(() => {
      runStub.restore();
    });

    it('should prefer the global installation if it meets the requirements', async () => {
      runStub.withArgs('which kind').resolves(['/usr/local/bin/kind']);
      runStub.withArgs('/usr/local/bin/kind --version').resolves([`kind version ${version.KIND_VERSION}`]);

      const result = await kindDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.true;

      expect(await kindDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, 'kind'))).not.to.be.ok;
      expect(kindDependencyManager.getKindPath()).to.equal('/usr/local/bin/kind');
    });

    it('should install kind locally if the global installation does not meet the requirements', async () => {
      runStub.withArgs('which kind').resolves(['/usr/local/bin/kind']);
      runStub.withArgs('/usr/local/bin/kind --version').resolves(['kind version 0.1.0']);
      runStub.withArgs(`${PathEx.join(temporaryDirectory, 'kind')} --version`).resolves(['kind version 0.1.0']);

      const result = await kindDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.false;

      expect(await kindDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, 'kind'))).to.be.ok;
      expect(kindDependencyManager.getKindPath()).to.equal(PathEx.join(temporaryDirectory, 'kind'));
    });
  });

  describe('Kind Installation Tests', () => {
    each([
      ['linux', 'x64'],
      ['linux', 'amd64'],
      ['windows', 'amd64'],
    ]).it('should be able to install kind base on %s and %s', async (osPlatform: any, osArch: string) => {
      const kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory, osPlatform, osArch);

      if (fs.existsSync(temporaryDirectory)) {
        fs.rmSync(temporaryDirectory, {recursive: true});
      }

      await kindDependencyManager.uninstallLocal();
      expect(await kindDependencyManager.isInstalledLocally()).not.to.be.ok;

      expect(await kindDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(await kindDependencyManager.isInstalledLocally()).to.be.ok;

      fs.rmSync(temporaryDirectory, {recursive: true});
    });
  });
});
