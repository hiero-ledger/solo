// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, beforeEach, afterEach, describe, it} from 'mocha';
import each from 'mocha-each';

import fs from 'node:fs';
import sinon, {type SinonStub} from 'sinon';
import {container} from 'tsyringe-neo';
import {platform} from 'node:process';

import {CraneDependencyManager} from '../../../../../src/core/dependency-managers/crane-dependency-manager.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../../src/core/constants.js';
import {OperatingSystem} from '../../../../../src/business/utils/operating-system.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {ShellRunner} from '../../../../../src/core/shell-runner.js';
import {type PackageDownloader} from '../../../../../src/core/package-downloader.js';
import {type ReleaseInfo} from '../../../../../src/types/index.js';

// Test data constants
const CRANE_VERSION: string = version.CRANE_VERSION.replace(/^v/, '');
const MOCK_RELEASE_TAG: string = `v${CRANE_VERSION}`;
const MOCK_RELEASE_URL: string = `https://github.com/google/go-containerregistry/releases/tag/${MOCK_RELEASE_TAG}`;
const MOCK_DOWNLOAD_URL_BASE: string = `https://github.com/google/go-containerregistry/releases/download/${MOCK_RELEASE_TAG}`;

// Match the currently observed upstream naming style
const MOCK_LINUX_ASSET_NAME: string = 'go-containerregistry_Linux_x86_64.tar.gz';
const MOCK_DARWIN_ARM64_ASSET_NAME: string = 'go-containerregistry_Darwin_arm64.tar.gz';
const MOCK_WINDOWS_ASSET_NAME: string = 'go-containerregistry_Windows_x86_64.tar.gz';

const MOCK_LINUX_DOWNLOAD_URL: string = `${MOCK_DOWNLOAD_URL_BASE}/${MOCK_LINUX_ASSET_NAME}`;
const MOCK_DARWIN_ARM64_DOWNLOAD_URL: string = `${MOCK_DOWNLOAD_URL_BASE}/${MOCK_DARWIN_ARM64_ASSET_NAME}`;
const MOCK_WINDOWS_DOWNLOAD_URL: string = `${MOCK_DOWNLOAD_URL_BASE}/${MOCK_WINDOWS_ASSET_NAME}`;

const MOCK_CHECKSUM: string = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const MOCK_CHECKSUM_WITH_PREFIX: string = `sha256:${MOCK_CHECKSUM}`;

const MOCK_GITHUB_RELEASES_RESPONSE: {
  ok: boolean;
  json: () => Promise<any[]>;
} = {
  ok: true,
  json: async (): Promise<any[]> => [
    {
      tag_name: MOCK_RELEASE_TAG,
      html_url: MOCK_RELEASE_URL,
      assets: [
        {
          name: MOCK_LINUX_ASSET_NAME,
          browser_download_url: MOCK_LINUX_DOWNLOAD_URL,
          content_type: 'application/gzip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
        {
          name: MOCK_DARWIN_ARM64_ASSET_NAME,
          browser_download_url: MOCK_DARWIN_ARM64_DOWNLOAD_URL,
          content_type: 'application/gzip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
        {
          name: MOCK_WINDOWS_ASSET_NAME,
          browser_download_url: MOCK_WINDOWS_DOWNLOAD_URL,
          content_type: 'application/gzip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
      ],
    },
  ],
};

const MOCK_GITHUB_ERROR_RESPONSE: {
  ok: boolean;
  status: number;
} = {
  ok: false,
  status: 404,
};

const MOCK_GITHUB_EMPTY_RELEASES: {
  ok: boolean;
  json: () => Promise<any[]>;
} = {
  ok: true,
  json: async (): Promise<any[]> => [],
};

const MOCK_GITHUB_RELEASES_NO_MATCHING_ASSET: {
  ok: boolean;
  json: () => Promise<any[]>;
} = {
  ok: true,
  json: async (): Promise<any[]> => [
    {
      tag_name: MOCK_RELEASE_TAG,
      html_url: MOCK_RELEASE_URL,
      assets: [
        {
          name: 'some-other-asset.tar.gz',
          browser_download_url: `${MOCK_DOWNLOAD_URL_BASE}/some-other-asset.tar.gz`,
          content_type: 'application/gzip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
      ],
    },
  ],
};

describe('CraneDependencyManager', (): void => {
  const originalPlatform: NodeJS.Platform = platform;
  const originalInstallationDirectory: string = container.resolve<string>(InjectTokens.CraneInstallationDirectory);
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');
  let sandbox: sinon.SinonSandbox;

  before((): void => {
    fs.mkdirSync(temporaryDirectory, {recursive: true});
    sandbox = sinon.createSandbox();
  });

  after((): void => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
    container.register(InjectTokens.CraneInstallationDirectory, {useValue: originalInstallationDirectory});
  });

  afterEach((): void => {
    container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
    container.register(InjectTokens.CraneInstallationDirectory, {useValue: originalInstallationDirectory});
    sandbox.restore();
  });

  it('should return crane version', (): void => {
    const craneDependencyManager: CraneDependencyManager = new CraneDependencyManager(
      undefined,
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
    );
    expect(craneDependencyManager.getRequiredVersion()).to.equal(version.CRANE_VERSION);
  });

  it('should be able to check when crane not installed', (): void => {
    const craneDependencyManager: CraneDependencyManager = new CraneDependencyManager(
      undefined,
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
    );
    expect(craneDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when crane is installed', (): void => {
    const craneDependencyManager: CraneDependencyManager = new CraneDependencyManager(
      undefined,
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
    );
    fs.writeFileSync(PathEx.join(temporaryDirectory, constants.CRANE), '');
    expect(craneDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('CraneDependencyManager system methods', (): void => {
    let craneDependencyManager: CraneDependencyManager;
    let fetchStub: SinonStub;
    let originalFetch: typeof globalThis.fetch;

    beforeEach((): void => {
      craneDependencyManager = new CraneDependencyManager(
        undefined,
        undefined,
        temporaryDirectory,
        process.arch,
        undefined,
      );

      originalFetch = globalThis.fetch;
      globalThis.fetch = sandbox.stub() as never;
      fetchStub = globalThis.fetch as SinonStub;
    });

    afterEach((): void => {
      globalThis.fetch = originalFetch;
      container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
      sandbox.restore();
    });

    it('getVersion should return version from crane version output', async (): Promise<void> => {
      const executableWithPath: string = '/usr/local/bin/crane';
      sandbox.stub(ShellRunner.prototype, 'run').withArgs(`"${executableWithPath}" version`).resolves(['0.21.4']);

      const actualVersion: string = await craneDependencyManager.getVersion(executableWithPath);
      expect(actualVersion).to.equal('0.21.4');
    });

    it('getVersion should throw error when command fails', async (): Promise<void> => {
      sandbox.stub(ShellRunner.prototype, 'run').rejects(new Error('Command failed'));

      try {
        await craneDependencyManager.getVersion('/usr/local/bin/crane');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to check crane version');
      }
    });

    it('getVersion should throw error when version pattern not found', async (): Promise<void> => {
      sandbox.stub(ShellRunner.prototype, 'run').resolves(['invalid output']);

      try {
        await craneDependencyManager.getVersion('/usr/local/bin/crane');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to check crane version');
      }
    });

    it('getArch should normalize architecture names', (): void => {
      let manager: CraneDependencyManager = new CraneDependencyManager(
        undefined,
        undefined,
        temporaryDirectory,
        'x64',
        undefined,
      );
      // @ts-expect-error TS2341: Property getArch is protected
      expect(manager.getArch()).to.equal('amd64');

      manager = new CraneDependencyManager(undefined, undefined, temporaryDirectory, 'arm64', undefined);
      // @ts-expect-error TS2341: Property getArch is protected
      expect(manager.getArch()).to.equal('arm64');

      manager = new CraneDependencyManager(undefined, undefined, temporaryDirectory, 'aarch64', undefined);
      // @ts-expect-error TS2341: Property getArch is protected
      expect(manager.getArch()).to.equal('arm64');
    });

    it('fetchReleaseInfo should parse GitHub API response correctly for linux', async (): Promise<void> => {
      fetchStub.resolves(MOCK_GITHUB_RELEASES_RESPONSE);
      container.register(InjectTokens.OsPlatform, {useValue: OperatingSystem.OS_LINUX});

      craneDependencyManager = new CraneDependencyManager(
        undefined,
        undefined,
        temporaryDirectory,
        'x64',
        MOCK_RELEASE_TAG,
      );

      // @ts-expect-error TS2341: Property fetchReleaseInfo is private
      const releaseInfo: ReleaseInfo = await craneDependencyManager.fetchReleaseInfo(MOCK_RELEASE_TAG);

      expect(releaseInfo.downloadUrl).to.equal(MOCK_DOWNLOAD_URL_BASE);
      expect(releaseInfo.assetName).to.equal(MOCK_LINUX_ASSET_NAME);
      expect(releaseInfo.checksum).to.equal(MOCK_CHECKSUM);
      expect(releaseInfo.version).to.equal(CRANE_VERSION);
    });

    it('fetchReleaseInfo should parse GitHub API response correctly for darwin arm64', async (): Promise<void> => {
      fetchStub.resolves(MOCK_GITHUB_RELEASES_RESPONSE);
      container.register(InjectTokens.OsPlatform, {useValue: OperatingSystem.OS_DARWIN});

      craneDependencyManager = new CraneDependencyManager(
        undefined,
        undefined,
        temporaryDirectory,
        'arm64',
        MOCK_RELEASE_TAG,
      );

      // @ts-expect-error TS2341: Property fetchReleaseInfo is private
      const releaseInfo: ReleaseInfo = await craneDependencyManager.fetchReleaseInfo(MOCK_RELEASE_TAG);

      expect(releaseInfo.assetName).to.equal(MOCK_DARWIN_ARM64_ASSET_NAME);
      expect(releaseInfo.checksum).to.equal(MOCK_CHECKSUM);
    });

    it('fetchReleaseInfo should handle API error', async (): Promise<void> => {
      fetchStub.resolves(MOCK_GITHUB_ERROR_RESPONSE);

      try {
        // @ts-expect-error TS2341: Property fetchReleaseInfo is private
        await craneDependencyManager.fetchReleaseInfo(MOCK_RELEASE_TAG);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('GitHub API request failed with status 404');
      }
    });

    it('fetchReleaseInfo should handle empty releases array', async (): Promise<void> => {
      fetchStub.resolves(MOCK_GITHUB_EMPTY_RELEASES);

      try {
        // @ts-expect-error TS2341: Property fetchReleaseInfo is private
        await craneDependencyManager.fetchReleaseInfo(MOCK_RELEASE_TAG);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('No releases found');
      }
    });

    it('fetchReleaseInfo should handle no matching asset', async (): Promise<void> => {
      fetchStub.resolves(MOCK_GITHUB_RELEASES_NO_MATCHING_ASSET);
      container.register(InjectTokens.OsPlatform, {useValue: OperatingSystem.OS_LINUX});

      try {
        // @ts-expect-error TS2341: Property fetchReleaseInfo is private
        await craneDependencyManager.fetchReleaseInfo(MOCK_RELEASE_TAG);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('No matching crane asset found for');
      }
    });
  });

  describe('when crane is installed globally', (): void => {
    let craneDependencyManager: CraneDependencyManager;
    let runStub: SinonStub;
    let existsSyncStub: SinonStub;
    let fetchStub: SinonStub;
    let originalFetch: typeof globalThis.fetch;
    let packageDownloader: PackageDownloader;

    beforeEach((): void => {
      packageDownloader = container.resolve(InjectTokens.PackageDownloader);

      craneDependencyManager = new CraneDependencyManager(
        undefined,
        undefined,
        temporaryDirectory,
        process.arch,
        undefined,
      );
      craneDependencyManager.uninstallLocal();
      runStub = sandbox.stub(craneDependencyManager, 'run');

      originalFetch = globalThis.fetch;
      globalThis.fetch = sandbox.stub() as never;
      fetchStub = globalThis.fetch as SinonStub;
      fetchStub.resolves(MOCK_GITHUB_RELEASES_RESPONSE);

      sandbox.stub(fs, 'cpSync').returns();
      sandbox.stub(fs, 'chmodSync').returns();
      existsSyncStub = sandbox.stub(fs, 'existsSync').returns(true);
      sandbox.stub(fs, 'rmSync').returns();
    });

    afterEach((): void => {
      globalThis.fetch = originalFetch;
      sandbox.restore();
    });

    it('should prefer the global installation if it meets the requirements', async (): Promise<void> => {
      const downloaderFetchPackageSpy: sinon.SinonSpy = sandbox.spy(packageDownloader, 'fetchPackage');

      runStub.withArgs('which crane').resolves(['/usr/local/bin/crane']);
      runStub.withArgs('"/usr/local/bin/crane" version').resolves(['0.21.4']);
      runStub.withArgs(`"${temporaryDirectory}/crane" version`).resolves(['0.21.4']);
      existsSyncStub.withArgs(`${temporaryDirectory}/crane`).returns(false);

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await craneDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.true;

      expect(await craneDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(downloaderFetchPackageSpy.notCalled).to.be.true;
      expect(await craneDependencyManager.getExecutable()).to.equal(constants.CRANE);
    });

    it('should install crane locally if the global installation does not meet the requirements', async (): Promise<void> => {
      runStub.withArgs('which crane').resolves(['/usr/local/bin/crane']);
      runStub.withArgs('"/usr/local/bin/crane" version').resolves([`0.1.0`]);
      runStub.withArgs(`"${PathEx.join(temporaryDirectory, 'crane')}" version`).resolves([`0.1.0`]);
      existsSyncStub.withArgs(PathEx.join(temporaryDirectory, 'crane')).returns(true);

      const dummyDownloadedArchive: string = PathEx.join(getTemporaryDirectory(), 'crane.tar.gz');
      fs.writeFileSync(dummyDownloadedArchive, 'dummy');
      sandbox.stub(packageDownloader, 'fetchPackage').resolves(dummyDownloadedArchive);
      sandbox
        .stub(CraneDependencyManager.prototype as any, 'processDownloadedPackage')
        .callsFake(async (_packageFilePath: string, temporaryDirectory: string): Promise<string[]> => {
          const executablePath: string = PathEx.join(temporaryDirectory, constants.CRANE);
          fs.mkdirSync(temporaryDirectory, {recursive: true});
          fs.writeFileSync(executablePath, 'dummy executable');
          return [executablePath];
        });

      expect(await craneDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, constants.CRANE))).to.be.ok;
      expect(await craneDependencyManager.getExecutable()).to.equal(constants.CRANE);
    });
  });

  describe('Crane Installation Tests', (): void => {
    let originalFetch: typeof globalThis.fetch;
    let fetchStub: SinonStub;
    let packageDownloader: PackageDownloader;

    beforeEach((): void => {
      originalFetch = globalThis.fetch;
      globalThis.fetch = sandbox.stub() as never;
      fetchStub = globalThis.fetch as SinonStub;
      fetchStub.resolves(MOCK_GITHUB_RELEASES_RESPONSE);

      packageDownloader = container.resolve(InjectTokens.PackageDownloader);
    });

    afterEach((): void => {
      globalThis.fetch = originalFetch;
      container.register(InjectTokens.OsPlatform, {useValue: originalPlatform});
      container.register(InjectTokens.CraneInstallationDirectory, {useValue: originalInstallationDirectory});
      sandbox.restore();
    });

    each([
      [OperatingSystem.OS_LINUX, 'x64'],
      [OperatingSystem.OS_LINUX, 'amd64'],
      [OperatingSystem.OS_DARWIN, 'arm64'],
    ]).it(
      'should be able to install crane base on %s and %s',
      async (osPlatform: NodeJS.Platform, osArch: string): Promise<void> => {
        const installationDirectory: string = getTemporaryDirectory();

        container.register(InjectTokens.OsPlatform, {useValue: osPlatform});
        container.register(InjectTokens.CraneInstallationDirectory, {useValue: installationDirectory});

        const craneDependencyManager: CraneDependencyManager = new CraneDependencyManager(
          undefined,
          undefined,
          installationDirectory,
          osArch,
          MOCK_RELEASE_TAG,
        );

        const dummyDownloadedArchive: string = PathEx.join(getTemporaryDirectory(), 'crane-package.tar.gz');
        fs.writeFileSync(dummyDownloadedArchive, 'dummy');

        sandbox.stub(packageDownloader, 'fetchPackage').resolves(dummyDownloadedArchive);
        sandbox
          .stub(CraneDependencyManager.prototype as any, 'processDownloadedPackage')
          .callsFake(async (_packageFilePath: string, temporaryDirectory: string): Promise<string[]> => {
            const executablePath: string = PathEx.join(temporaryDirectory, constants.CRANE);
            fs.mkdirSync(temporaryDirectory, {recursive: true});
            fs.writeFileSync(executablePath, 'dummy executable');
            return [executablePath];
          });

        sandbox.stub(ShellRunner.prototype, 'run').withArgs(`which ${constants.CRANE}`).alwaysReturned(false);

        craneDependencyManager.uninstallLocal();
        expect(craneDependencyManager.isInstalledLocally()).not.to.be.ok;

        expect(await craneDependencyManager.install(getTestCacheDirectory())).to.be.true;
        expect(craneDependencyManager.isInstalledLocally()).to.be.ok;

        fs.rmSync(installationDirectory, {recursive: true, force: true});
      },
    );
  });
});
