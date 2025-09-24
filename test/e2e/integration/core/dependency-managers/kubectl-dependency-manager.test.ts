// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import {KubectlDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import sinon, {type SinonStub} from 'sinon';

const mockVersionOutputValid = 'Client Version: v1.33.3\nKustomize Version: v5.6.0';
const mockVersionOutputLow = 'Client Version: v1.10.0\nKustomize Version: v5.6.0';
const mockVersionOutputMissingClient = 'Something Else: v1.10.0\nKustomize Version: v5.6.0';
const mockVersionOutputInvalid = 'invalid output';

describe('KubectlDependencyManager', (): void => {
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');
  const localInstallationDirectory = temporaryDirectory;

  before((): void => {
    fs.mkdirSync(temporaryDirectory);
  });

  after((): void => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  it('should return kubectl version', (): void => {
    const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
      undefined,
      localInstallationDirectory,
      undefined,
      undefined,
      undefined,
    );
    expect(kubectlDependencyManager.getRequiredVersion()).to.equal(version.KUBECTL_VERSION);
  });

  it('should be able to check when kubectl not installed', (): void => {
    const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
      undefined,
      localInstallationDirectory,
      undefined,
      undefined,
      undefined,
    );
    expect(kubectlDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when kubectl is installed', async (): Promise<void> => {
    const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
      undefined,
      localInstallationDirectory,
      undefined,
      undefined,
      undefined,
    );
    fs.writeFileSync(await kubectlDependencyManager.getExecutablePath(), '');
    expect(kubectlDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('when kubectl is installed globally', (): void => {
    let kubectlDependencyManager: KubectlDependencyManager;
    let runStub: SinonStub;
    let cpSyncStub: SinonStub;
    let chmodSyncStub: SinonStub;
    let existsSyncStub: SinonStub;
    let rmSyncStub: SinonStub;

    beforeEach((): void => {
      kubectlDependencyManager = new KubectlDependencyManager(
        undefined,
        temporaryDirectory,
        process.platform,
        process.arch,
        undefined,
      );
      kubectlDependencyManager.uninstallLocal();
      runStub = sinon.stub(kubectlDependencyManager, 'run');
      cpSyncStub = sinon.stub(fs, 'cpSync').returns();
      chmodSyncStub = sinon.stub(fs, 'chmodSync').returns();
      existsSyncStub = sinon.stub(fs, 'existsSync').returns(true);
      rmSyncStub = sinon.stub(fs, 'rmSync').returns();
    });

    afterEach((): void => {
      runStub.restore();
      cpSyncStub.restore();
      chmodSyncStub.restore();
      existsSyncStub.restore();
      rmSyncStub.restore();
    });

    it('should prefer the global installation if it meets the requirements', async (): Promise<void> => {
      runStub.withArgs('which kubectl').resolves(['/usr/local/bin/kubectl']);
      runStub.withArgs('/usr/local/bin/kubectl version --client').resolves(mockVersionOutputValid.split('\n'));
      runStub
        .withArgs(`${localInstallationDirectory}/kubectl version --client`)
        .resolves(mockVersionOutputValid.split('\n'));
      existsSyncStub.withArgs(`${localInstallationDirectory}/kubectl`).returns(false);

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await kubectlDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.true;

      expect(await kubectlDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(cpSyncStub.calledOnce).to.be.true;
      expect(await kubectlDependencyManager.getExecutablePath()).to.equal(`${localInstallationDirectory}/kubectl`);
    });

    it('should install kubectl locally if the global installation does not meet the requirements', async (): Promise<void> => {
      runStub.withArgs('which kubectl').resolves(['/usr/local/bin/kubectl']);
      runStub.withArgs('/usr/local/bin/kubectl version --client').resolves(mockVersionOutputLow.split('\n'));
      runStub
        .withArgs(`${PathEx.join(localInstallationDirectory, 'kubectl')} version --client`)
        .resolves(mockVersionOutputLow.split('\n'));

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await kubectlDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.false;

      expect(await kubectlDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(localInstallationDirectory, 'kubectl'))).to.be.ok;
      expect(await kubectlDependencyManager.getExecutablePath()).to.equal(
        PathEx.join(localInstallationDirectory, 'kubectl'),
      );
    });
  });

  describe('Kubectl Installation Tests', (): void => {
    each([
      ['linux', 'x64'],
      ['linux', 'amd64'],
      ['windows', 'amd64'],
    ]).it(
      'should be able to install kubectl base on %s and %s',
      async (osPlatform: NodeJS.Platform, osArch: string): Promise<void> => {
        const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
          undefined,
          localInstallationDirectory,
          osPlatform,
          osArch,
          undefined,
        );

        if (fs.existsSync(temporaryDirectory)) {
          fs.rmSync(temporaryDirectory, {recursive: true});
        }

        kubectlDependencyManager.uninstallLocal();
        expect(kubectlDependencyManager.isInstalledLocally()).not.to.be.ok;

        expect(await kubectlDependencyManager.install(getTestCacheDirectory())).to.be.true;
        expect(kubectlDependencyManager.isInstalledLocally()).to.be.ok;

        fs.rmSync(temporaryDirectory, {recursive: true});
      },
    );
  });

  describe('KubectlDependencyManager system methods', (): void => {
    let kubectlDependencyManager: KubectlDependencyManager;

    beforeEach((): void => {
      kubectlDependencyManager = new KubectlDependencyManager(
        undefined,
        localInstallationDirectory,
        process.platform,
        process.arch,
        undefined,
      );
    });

    it('getGlobalExecutablePath returns false if not found', async (): Promise<void> => {
      const runStub: SinonStub = sinon.stub(kubectlDependencyManager, 'run').resolves([]);
      // @ts-expect-error TS2341: Property getGlobalExecutablePath is private
      expect(await kubectlDependencyManager.getGlobalExecutablePath()).to.be.false;
      runStub.restore();
    });

    it('getVersion should succeed with valid version output', async (): Promise<void> => {
      const runStub: SinonStub = sinon
        .stub(kubectlDependencyManager, 'run')
        .resolves(mockVersionOutputValid.split('\n'));

      expect(await kubectlDependencyManager.getVersion('/usr/local/bin/kubectl')).to.equal('1.33.3');
      runStub.restore();
    });

    it('getVersion should handle error if kubectl version fails', async (): Promise<void> => {
      const runStub: SinonStub = sinon.stub(kubectlDependencyManager, 'run').rejects(new Error('Command failed'));

      try {
        await kubectlDependencyManager.getVersion('/usr/local/bin/kubectl');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to check kubectl version');
      }

      runStub.restore();
    });

    it('getVersion should handle invalid output', async (): Promise<void> => {
      const runStub: SinonStub = sinon
        .stub(kubectlDependencyManager, 'run')
        .resolves(mockVersionOutputInvalid.split('\n'));

      try {
        await kubectlDependencyManager.getVersion('/usr/local/bin/kubectl');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to check kubectl version');
      }

      runStub.restore();
    });

    it('getVersion should handle missing client version in output', async (): Promise<void> => {
      const runStub: SinonStub = sinon
        .stub(kubectlDependencyManager, 'run')
        .resolves(mockVersionOutputMissingClient.split('\n'));

      try {
        await kubectlDependencyManager.getVersion('/usr/local/bin/kubectl');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to check kubectl version');
      }

      runStub.restore();
    });

    it('processDownloadedPackage should handle platform-specific executable names', async (): Promise<void> => {
      // First test with non-Windows platform
      let kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
        undefined,
        localInstallationDirectory,
        'linux',
        'amd64',
        undefined,
      );

      // @ts-expect-error TS2341: Property processDownloadedPackage is private
      const linuxResult = await kubectlDependencyManager.processDownloadedPackage('/tmp/kubectl', '/tmp');
      expect(linuxResult).to.contain('/tmp/kubectl');

      // Now test with Windows platform
      kubectlDependencyManager = new KubectlDependencyManager(
        undefined,
        localInstallationDirectory,
        'windows' as NodeJS.Platform,
        'amd64',
        undefined,
      );

      // @ts-expect-error TS2341: Property processDownloadedPackage is private
      const windowsResult = await kubectlDependencyManager.processDownloadedPackage('/tmp/kubectl.exe', '/tmp');
      expect(windowsResult).to.contain('/tmp/kubectl.exe');
    });

    it('getArtifactName should generate correct URL format based on platform/arch', (): void => {
      const kubectlDependencyManager: KubectlDependencyManager = new KubectlDependencyManager(
        undefined,
        localInstallationDirectory,
        'linux',
        'amd64',
        '1.25.0',
      );

      // @ts-expect-error TS2341: Property getArtifactName is private
      const artifactName = kubectlDependencyManager.getArtifactName();
      expect(artifactName).to.include('1.25.0');
      expect(artifactName).to.include('linux');
      expect(artifactName).to.include('amd64');
    });
  });
});
