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
import {OperatingSystem} from '../../../../../src/business/utils/operating-system.js';

describe('KindDependencyManager', (): void => {
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');
  const originalPlatform: NodeJS.Platform = process.platform;

  before((): void => {
    fs.mkdirSync(temporaryDirectory);
  });

  after((): void => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
    // @ts-expect-error TS2341: to modify read-only property
    process.platform = originalPlatform;
  });

  it('should return kind version', (): void => {
    const kindDependencyManager: KindDependencyManager = new KindDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
    );
    expect(kindDependencyManager.getRequiredVersion()).to.equal(version.KIND_VERSION);
  });

  it('should be able to check when kind not installed', (): void => {
    const kindDependencyManager: KindDependencyManager = new KindDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
    );
    expect(kindDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when kind is installed', async () => {
    const kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory, undefined, undefined);
    // Create the local executable file for testing
    const localPath = PathEx.join(temporaryDirectory, 'kind');
    fs.writeFileSync(localPath, '');
    expect(kindDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('when kind is installed globally', (): void => {
    let kindDependencyManager: KindDependencyManager;
    let runStub: SinonStub;
    let cpSyncStub: SinonStub;
    let chmodSyncStub: SinonStub;
    let renameSyncStub: SinonStub;
    let existsSyncStub: SinonStub;
    let rmSyncStub: SinonStub;

    beforeEach((): void => {
      kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory, process.arch, undefined);
      kindDependencyManager.uninstallLocal();
      runStub = sinon.stub(kindDependencyManager, 'run');

      // Add stubs for file system operations
      cpSyncStub = sinon.stub(fs, 'cpSync').returns();
      chmodSyncStub = sinon.stub(fs, 'chmodSync').returns();
      renameSyncStub = sinon.stub(fs, 'renameSync').returns();
      existsSyncStub = sinon.stub(fs, 'existsSync').returns(true);
      rmSyncStub = sinon.stub(fs, 'rmSync').returns();
    });

    afterEach((): void => {
      runStub.restore();
      cpSyncStub.restore();
      chmodSyncStub.restore();
      renameSyncStub.restore();
      existsSyncStub.restore();
      rmSyncStub.restore();
    });

    it('should prefer the global installation if it meets the requirements', async (): Promise<void> => {
      runStub.withArgs('which kind').resolves(['/usr/local/bin/kind']);
      runStub.withArgs('/usr/local/bin/kind --version').resolves([`kind version ${version.KIND_VERSION}`]);
      runStub.withArgs(`${temporaryDirectory}/kind --version`).resolves([`kind version ${version.KIND_VERSION}`]);
      existsSyncStub.withArgs(`${temporaryDirectory}/kind`).returns(false);

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await kindDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.true;

      expect(await kindDependencyManager.install(getTestCacheDirectory())).to.be.true;

      // Verify that the file system operations were called
      expect(cpSyncStub.calledOnce).to.be.true;
      // Should return global path since it meets requirements
      expect(await kindDependencyManager.getExecutablePath()).to.equal('/usr/local/bin/kind');
    });

    it('should install kind locally if the global installation does not meet the requirements', async (): Promise<void> => {
      runStub.withArgs('which kind').resolves(['/usr/local/bin/kind']);
      runStub.withArgs('/usr/local/bin/kind --version').resolves(['kind version 0.1.0']);
      runStub.withArgs(`${PathEx.join(temporaryDirectory, 'kind')} --version`).resolves(['kind version 0.1.0']);
      existsSyncStub.withArgs(PathEx.join(temporaryDirectory, 'kind')).returns(true);

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await kindDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.false;

      expect(await kindDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, 'kind'))).to.be.ok;
      expect(await kindDependencyManager.getExecutablePath()).to.equal(PathEx.join(temporaryDirectory, 'kind'));
    });
  });

  describe('Kind Installation Tests', (): void => {
    each([
      [OperatingSystem.OS_LINUX, 'x64'],
      [OperatingSystem.OS_LINUX, 'amd64'],
      [OperatingSystem.OS_WIN32, 'amd64'],
    ]).it(
      'should be able to install kind base on %s and %s',
      async (osPlatform: NodeJS.Platform, osArch: string): Promise<void> => {
        // @ts-expect-error TS2341: to modify read-only property
        process.platform = osPlatform;

        const kindDependencyManager: KindDependencyManager = new KindDependencyManager(
          undefined,
          temporaryDirectory,
          osArch,
          undefined,
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
    let runStub: SinonStub;

    beforeEach((): void => {
      kindDependencyManager = new KindDependencyManager(undefined, temporaryDirectory, process.arch, undefined);

      runStub = sinon.stub(kindDependencyManager, 'run');
    });

    afterEach((): void => {
      runStub.restore();
    });

    it('getGlobalExecutablePath returns false if not found', async (): Promise<void> => {
      runStub.resolves([]);
      // @ts-expect-error TS2341: Property getGlobalExecutablePath is private
      expect(await kindDependencyManager.getGlobalExecutablePath()).to.be.false;
    });

    it('installationMeetsRequirements returns false on error', async (): Promise<void> => {
      runStub.rejects(new Error('fail'));
      const path: string = await kindDependencyManager.getExecutablePath();
      try {
        await kindDependencyManager.installationMeetsRequirements(path);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to check kind version');
      }
    });

    it('installationMeetsRequirements returns false on invalid version', async (): Promise<void> => {
      runStub.resolves(['not a version']);
      try {
        const path: string = await kindDependencyManager.getExecutablePath();
        await kindDependencyManager.installationMeetsRequirements(path);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to check kind version');
      }
    });

    it('installationMeetsRequirements returns false on lower than required version', async (): Promise<void> => {
      runStub.resolves(['v0.0.5']);
      const path: string = await kindDependencyManager.getExecutablePath();
      expect(await kindDependencyManager.installationMeetsRequirements(path)).to.be.false;
    });
  });
});
