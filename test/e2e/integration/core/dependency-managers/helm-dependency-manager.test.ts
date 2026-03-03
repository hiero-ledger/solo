// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import sinon, {type SinonStub} from 'sinon';

import {HelmDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import {OperatingSystem} from '../../../../../src/business/utils/operating-system.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {container} from 'tsyringe-neo';
import {platform} from 'node:process';

describe('HelmDependencyManager', (): void => {
  const originalPlatform: NodeJS.Platform = platform;
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');

  before((): void => fs.mkdirSync(temporaryDirectory));

  after((): void => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  afterEach((): void => {
    container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
  });

  it('should return helm version', (): void => {
    const helmDependencyManager: HelmDependencyManager = new HelmDependencyManager(
      undefined,
      undefined,
      temporaryDirectory,
    );
    expect(helmDependencyManager.getRequiredVersion()).to.equal(version.HELM_VERSION);
  });

  it('should be able to check when helm not installed', (): void => {
    const helmDependencyManager: HelmDependencyManager = new HelmDependencyManager(
      undefined,
      undefined,
      temporaryDirectory,
    );
    expect(helmDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when helm is installed', async (): Promise<void> => {
    const helmDependencyManager: HelmDependencyManager = new HelmDependencyManager(
      undefined,
      undefined,
      temporaryDirectory,
    );
    // Create the local executable file for testing
    const localPath: string = PathEx.join(temporaryDirectory, 'helm');
    fs.writeFileSync(localPath, '');
    expect(helmDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('Helm Installation Tests', (): void => {
    afterEach((): void => {
      container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
    });

    each([
      [OperatingSystem.OS_LINUX, 'x64'],
      [OperatingSystem.OS_LINUX, 'amd64'],
      [OperatingSystem.OS_WIN32, 'amd64'],
    ]).it(
      'should be able to install helm base on %s and %s',
      async (osPlatform: any, osArch: string): Promise<void> => {
        container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});

        const helmDependencyManager: HelmDependencyManager = new HelmDependencyManager(
          undefined,
          undefined,
          temporaryDirectory,
          osArch,
        );

        if (fs.existsSync(temporaryDirectory)) {
          fs.rmSync(temporaryDirectory, {recursive: true});
        }

        helmDependencyManager.uninstallLocal();
        expect(helmDependencyManager.isInstalledLocally()).not.to.be.ok;

        expect(await helmDependencyManager.install(getTestCacheDirectory())).to.be.true;
        expect(helmDependencyManager.isInstalledLocally()).to.be.ok;

        fs.rmSync(temporaryDirectory, {recursive: true});
      },
    );
  });

  describe('when helm is installed globally', (): void => {
    let helmDependencyManager: HelmDependencyManager;
    let runStub: SinonStub;

    beforeEach((): void => {
      helmDependencyManager = new HelmDependencyManager(undefined, undefined, temporaryDirectory, process.arch);
      helmDependencyManager.uninstallLocal();
      runStub = sinon.stub(helmDependencyManager, 'run');
    });

    afterEach((): void => {
      runStub.restore();
    });

    it('should prefer the global installation if it meets the requirements', async (): Promise<void> => {
      // Use a temporary directory for the dummy global helm binary
      const globalBinDirectory: string = PathEx.join(temporaryDirectory, 'global-bin');
      const globalHelmPath: string = PathEx.join(globalBinDirectory, 'helm');
      fs.mkdirSync(globalBinDirectory, {recursive: true});
      fs.writeFileSync(globalHelmPath, '');

      runStub.withArgs('which helm').resolves([globalHelmPath]);
      runStub.withArgs(`"${globalHelmPath}" version --short`).resolves([`${version.HELM_VERSION}+gabcdef`]);

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await helmDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.true;

      expect(await helmDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, 'helm'))).to.be.ok;
      // Should return global path since it meets requirements
      expect(await helmDependencyManager.getExecutablePath()).to.equal(globalHelmPath);

      // Clean up dummy global helm binary
      fs.rmSync(globalHelmPath);
      fs.rmdirSync(globalBinDirectory);
    });

    it('should install helm locally if the global installation does not meet the requirements', async (): Promise<void> => {
      runStub.withArgs('which helm').resolves(['/usr/local/bin/helm']);
      runStub.withArgs('"/usr/local/bin/helm" version --short').resolves(['v0.1.0+gabcdef']);
      runStub.withArgs(`"${PathEx.join(temporaryDirectory, 'helm')}" version --short`).resolves(['v0.1.0+gabcdef']);
      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await helmDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.false;

      expect(await helmDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, 'helm'))).to.be.ok;
      expect(await helmDependencyManager.getExecutablePath()).to.equal(PathEx.join(temporaryDirectory, 'helm'));
    });
  });
});
