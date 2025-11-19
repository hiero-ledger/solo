// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import {CurlDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import sinon, {type SinonStub} from 'sinon';

describe('CurlDependencyManager', (): void => {
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');

  before((): void => {
    fs.mkdirSync(temporaryDirectory);
  });

  after((): void => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  it('should return curl version', (): void => {
    const curlDependencyManager: CurlDependencyManager = new CurlDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(curlDependencyManager.getRequiredVersion()).to.equal(version.CURL_VERSION);
  });

  it('should be able to check when curl not installed', (): void => {
    const curlDependencyManager: CurlDependencyManager = new CurlDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(curlDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when curl is installed', async (): Promise<void> => {
    const curlDependencyManager: CurlDependencyManager = new CurlDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    // Create the local executable file for testing
    const localPath: string = PathEx.join(temporaryDirectory, 'curl');
    fs.writeFileSync(localPath, '');
    expect(curlDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('when curl is installed globally', (): void => {
    let curlDependencyManager: CurlDependencyManager;
    let runStub: SinonStub;
    let cpSyncStub: SinonStub;
    let chmodSyncStub: SinonStub;
    let renameSyncStub: SinonStub;
    let existsSyncStub: SinonStub;
    let rmSyncStub: SinonStub;

    beforeEach((): void => {
      curlDependencyManager = new CurlDependencyManager(
        undefined,
        temporaryDirectory,
        process.platform,
        process.arch,
        undefined,
        undefined,
      );
      curlDependencyManager.uninstallLocal();
      runStub = sinon.stub(curlDependencyManager, 'run');

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
      runStub.withArgs('which curl').resolves(['/usr/local/bin/curl']);
      runStub.withArgs('/usr/local/bin/curl --version').resolves([`curl ${version.CURL_VERSION}`]);
      runStub.withArgs(`${temporaryDirectory}/curl --version`).resolves([`curl version ${version.CURL_VERSION}`]);
      existsSyncStub.withArgs(`${temporaryDirectory}/curl`).returns(false);

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await curlDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.true;

      expect(await curlDependencyManager.install(getTestCacheDirectory())).to.be.true;

      expect(cpSyncStub.calledOnce).to.be.true;
      expect(await curlDependencyManager.getExecutablePath()).to.equal('/usr/local/bin/curl');
    });

    it('should install curl locally if the global installation does not meet the requirements', async (): Promise<void> => {
      runStub.withArgs('/usr/local/bin/curl --version').resolves(['curl 0.1.0']);
      runStub.withArgs(`${PathEx.join(temporaryDirectory, 'curl')} --version`).resolves(['curl 0.1.0']);

      existsSyncStub.withArgs(PathEx.join(temporaryDirectory, 'curl')).returns(true);

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await curlDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.false;

      expect(await curlDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, 'curl'))).to.be.ok;
      expect(await curlDependencyManager.getExecutablePath()).to.equal(PathEx.join(temporaryDirectory, 'curl'));
    });
  });

  describe('Kind Installation Tests', (): void => {
    each([
      ['linux', 'x64'],
      ['linux', 'amd64'],
      ['win32', 'amd64'],
    ]).it(
      'should be able to install curl base on %s and %s',
      async (osPlatform: NodeJS.Platform, osArch: string): Promise<void> => {
        const curlDependencyManager: CurlDependencyManager = new CurlDependencyManager(
          undefined,
          temporaryDirectory,
          osPlatform,
          osArch,
          undefined,
          undefined,
        );

        if (fs.existsSync(temporaryDirectory)) {
          fs.rmSync(temporaryDirectory, {recursive: true});
        }

        curlDependencyManager.uninstallLocal();
        expect(curlDependencyManager.isInstalledLocally()).not.to.be.ok;

        expect(await curlDependencyManager.install(getTestCacheDirectory())).to.be.true;
        expect(curlDependencyManager.isInstalledLocally()).to.be.ok;

        fs.rmSync(temporaryDirectory, {recursive: true});
      },
    );
  });

  describe('CurlDependencyManager system methods', (): void => {
    let curlDependencyManager: CurlDependencyManager;
    let runStub: SinonStub;

    beforeEach((): void => {
      curlDependencyManager = new CurlDependencyManager(
        undefined,
        temporaryDirectory,
        process.platform,
        process.arch,
        undefined,
        undefined,
      );

      runStub = sinon.stub(curlDependencyManager, 'run');
    });

    afterEach((): void => {
      runStub.restore();
    });

    it('getGlobalExecutablePath returns false if not found', async (): Promise<void> => {
      runStub.resolves([]);
      // @ts-expect-error TS2341: Property getGlobalExecutablePath is private
      expect(await curlDependencyManager.getGlobalExecutablePath()).to.be.false;
    });

    it('installationMeetsRequirements returns false on error', async (): Promise<void> => {
      runStub.rejects(new Error('fail'));
      const path: string = await curlDependencyManager.getExecutablePath();
      try {
        await curlDependencyManager.installationMeetsRequirements(path);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to check curl version');
      }
    });

    it('installationMeetsRequirements returns false on invalid version', async (): Promise<void> => {
      runStub.resolves(['not a version']);
      try {
        const path: string = await curlDependencyManager.getExecutablePath();
        await curlDependencyManager.installationMeetsRequirements(path);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Unable to parse curl version');
      }
    });

    it('installationMeetsRequirements returns false on lower than required version', async (): Promise<void> => {
      runStub.resolves(['curl 0.0.5']);
      const path: string = await curlDependencyManager.getExecutablePath();
      expect(await curlDependencyManager.installationMeetsRequirements(path)).to.be.false;
    });
  });
});
