// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import {KindDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import sinon, {type SinonStub} from 'sinon';

describe('KindDependencyManager', (): void => {
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');

  before((): void => {
    fs.mkdirSync(temporaryDirectory);
  });

  after((): void => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  it('should return kind version', (): void => {
    const kindDependencyManager: KindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory);
    expect(kindDependencyManager.getKindVersion()).to.equal(version.KIND_VERSION);
  });

  it('should be able to check when kind not installed', (): void => {
    const kindDependencyManager: KindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory);
    expect(kindDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when kind is installed', (): void => {
    const kindDependencyManager: KindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory);
    fs.writeFileSync(kindDependencyManager.getKindPath(), '');
    expect(kindDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('when kind is installed globally', (): void => {
    let kindDependencyManager: KindDependencyManager;
    let runStub: SinonStub;

    beforeEach((): void => {
      kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory, process.platform, process.arch);
      kindDependencyManager.uninstallLocal();
      runStub = sinon.stub(kindDependencyManager, 'run');
    });

    afterEach((): void => {
      runStub.restore();
    });

    it('should prefer the global installation if it meets the requirements', async (): Promise<void> => {
      runStub.withArgs('which kind').resolves(['/usr/local/bin/kind']);
      runStub.withArgs('/usr/local/bin/kind --version').resolves([`kind version ${version.KIND_VERSION}`]);

      const result: boolean = await kindDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.true;

      expect(await kindDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, 'kind'))).not.to.be.ok;
      expect(kindDependencyManager.getKindPath()).to.equal('/usr/local/bin/kind');
    });

    it('should install kind locally if the global installation does not meet the requirements', async (): Promise<void> => {
      runStub.withArgs('which kind').resolves(['/usr/local/bin/kind']);
      runStub.withArgs('/usr/local/bin/kind --version').resolves(['kind version 0.1.0']);
      runStub.withArgs(`${PathEx.join(temporaryDirectory, 'kind')} --version`).resolves(['kind version 0.1.0']);

      const result: boolean = await kindDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.false;

      expect(await kindDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, 'kind'))).to.be.ok;
      expect(kindDependencyManager.getKindPath()).to.equal(PathEx.join(temporaryDirectory, 'kind'));
    });
  });

  describe('Kind Installation Tests', (): void => {
    each([
      ['linux', 'x64'],
      ['linux', 'amd64'],
      ['windows', 'amd64'],
    ]).it(
      'should be able to install kind base on %s and %s',
      async (osPlatform: NodeJS.Platform, osArch: string): Promise<void> => {
        const kindDependencyManager: KindDependencyManager = new KindDependencyManager(
          undefined,
          temporaryDirectory,
          osPlatform,
          osArch,
        );

        if (fs.existsSync(temporaryDirectory)) {
          fs.rmSync(temporaryDirectory, {recursive: true});
        }

        kindDependencyManager.uninstallLocal();
        expect(kindDependencyManager.isInstalledLocally()).not.to.be.ok;

        expect(await kindDependencyManager.install(getTestCacheDirectory())).to.be.true;
        expect(kindDependencyManager.isInstalledLocally()).to.be.ok;

        fs.rmSync(temporaryDirectory, {recursive: true});
      },
    );
  });

  describe('KindDependencyManager system methods', (): void => {
    let kindDependencyManager: KindDependencyManager;

    beforeEach((): void => {
      kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory, process.platform, process.arch);
    });

    it('getGlobalExecutablePath returns false if not found', async (): Promise<void> => {
      const runStub: SinonStub = sinon.stub(kindDependencyManager, 'run').resolves([]);
      expect(await kindDependencyManager.getGlobalExecutablePath()).to.be.false;
      runStub.restore();
    });

    it('installationMeetsRequirements returns false on error', async (): Promise<void> => {
      const runStub: SinonStub = sinon.stub(kindDependencyManager, 'run').rejects(new Error('fail'));
      expect(await kindDependencyManager.installationMeetsRequirements('/bin/kind')).to.be.false;
      runStub.restore();
    });

    it('installationMeetsRequirements returns false on invalid version', async (): Promise<void> => {
      const runStub: SinonStub = sinon.stub(kindDependencyManager, 'run').resolves(['not a version']);
      expect(await kindDependencyManager.installationMeetsRequirements('/bin/kind')).to.be.false;
      runStub.restore();
    });

    it('installationMeetsRequirements returns false on lower than required version', async (): Promise<void> => {
      const runStub: SinonStub = sinon.stub(kindDependencyManager, 'run').resolves(['v0.0.5']);
      expect(await kindDependencyManager.installationMeetsRequirements('/bin/kind')).to.be.false;
      runStub.restore();
    });

    it('uninstallLocal removes file if exists', (): void => {
      fs.writeFileSync(kindDependencyManager.getKindPath(), '');
      expect(fs.existsSync(kindDependencyManager.getKindPath())).to.be.true;
      kindDependencyManager.uninstallLocal();
      expect(fs.existsSync(kindDependencyManager.getKindPath())).to.be.false;
    });
  });
});