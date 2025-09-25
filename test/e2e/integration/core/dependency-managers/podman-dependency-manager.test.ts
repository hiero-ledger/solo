// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, beforeEach, afterEach, describe, it} from 'mocha';
import fs from 'node:fs';
import sinon, {type SinonStub} from 'sinon';
import {PodmanDependencyManager} from '../../../../../src/core/dependency-managers/index.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../../../test-utility.js';
import * as version from '../../../../../version.js';
import {PathEx} from '../../../../../src/business/utils/path-ex.js';
import * as constants from '../../../../../src/core/constants.js';

// Test data constants
const PODMAN_VERSION: string = '4.6.1';
const PODMAN_LOW_VERSION: string = '0.1.0';
const MOCK_RELEASE_TAG: string = `v${PODMAN_VERSION}`;
const MOCK_RELEASE_URL: string = `https://github.com/containers/podman/releases/tag/${MOCK_RELEASE_TAG}`;
const MOCK_DOWNLOAD_URL_BASE: string = `https://github.com/containers/podman/releases/download/${MOCK_RELEASE_TAG}`;
const MOCK_LINUX_ASSET_NAME: string = 'podman-remote-static-linux_amd64.tar.gz';
const MOCK_WINDOWS_ASSET_NAME: string = 'podman-remote-release-windows_amd64.zip';
const MOCK_DARWIN_ARM64_ASSET_NAME: string = 'podman-remote-release-darwin_arm64.zip';
const MOCK_LINUX_DOWNLOAD_URL: string = `${MOCK_DOWNLOAD_URL_BASE}/${MOCK_LINUX_ASSET_NAME}`;
const MOCK_WINDOWS_DOWNLOAD_URL: string = `${MOCK_DOWNLOAD_URL_BASE}/${MOCK_WINDOWS_ASSET_NAME}`;
const MOCK_DARWIN_ARM64_DOWNLOAD_URL: string = `${MOCK_DOWNLOAD_URL_BASE}/${MOCK_DARWIN_ARM64_ASSET_NAME}`;
const MOCK_CHECKSUM: string = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const MOCK_CHECKSUM_WITH_PREFIX: string = `sha256:${MOCK_CHECKSUM}`;

// Mock GitHub API response for fetchLatestReleaseInfo
const MOCK_GITHUB_RELEASES_RESPONSE: {
  ok: boolean;
  json: () => Promise<any[]>;
} = {
  ok: true,
  json: async () => [
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
          name: MOCK_WINDOWS_ASSET_NAME,
          browser_download_url: MOCK_WINDOWS_DOWNLOAD_URL,
          content_type: 'application/zip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
        {
          name: MOCK_DARWIN_ARM64_ASSET_NAME,
          browser_download_url: MOCK_DARWIN_ARM64_DOWNLOAD_URL,
          content_type: 'application/zip',
          size: 12_345,
          digest: MOCK_CHECKSUM_WITH_PREFIX,
        },
      ],
    },
  ],
};

// Mock GitHub API response with no matching assets
const MOCK_GITHUB_RELEASES_NO_MATCHING_ASSET: {
  ok: boolean;
  json: () => Promise<any[]>;
} = {
  ok: true,
  json: async () => [
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

// Mock GitHub API error response
const MOCK_GITHUB_ERROR_RESPONSE: {
  ok: boolean;
  status: number;
} = {
  ok: false,
  status: 404,
};

// Mock GitHub API empty releases response
const MOCK_GITHUB_EMPTY_RELEASES: {
  ok: boolean;
  json: () => Promise<any[]>;
} = {
  ok: true,
  json: async () => [],
};

describe('PodmanDependencyManager', () => {
  const temporaryDirectory: string = PathEx.join(getTemporaryDirectory(), 'bin');

  before(() => {
    fs.mkdirSync(temporaryDirectory, {recursive: true});
  });

  after(() => {
    if (fs.existsSync(temporaryDirectory)) {
      fs.rmSync(temporaryDirectory, {recursive: true});
    }
  });

  it('should return podman version', () => {
    const podmanDependencyManager = new PodmanDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(podmanDependencyManager.getRequiredVersion()).to.equal(version.PODMAN_VERSION);
  });

  it('should be able to check when podman not installed', () => {
    const podmanDependencyManager = new PodmanDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(podmanDependencyManager.isInstalledLocally()).not.to.be.ok;
  });

  it('should be able to check when podman is installed', async () => {
    const podmanDependencyManager = new PodmanDependencyManager(
      undefined,
      temporaryDirectory,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    fs.writeFileSync(await podmanDependencyManager.getExecutablePath(), '');
    expect(podmanDependencyManager.isInstalledLocally()).to.be.ok;
  });

  describe('PodmanDependencyManager system methods', () => {
    let podmanDependencyManager: PodmanDependencyManager;
    let runStub: SinonStub;
    let fetchStub: SinonStub;

    beforeEach(() => {
      podmanDependencyManager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        process.platform,
        process.arch,
        undefined,
        undefined,
      );

      runStub = sinon.stub(podmanDependencyManager, 'run');

      // Mock fetch for fetchLatestReleaseInfo
      globalThis.fetch = sinon.stub() as any;
      fetchStub = globalThis.fetch as SinonStub;
    });

    afterEach(() => {
      runStub.restore();
      sinon.restore();
    });

    it('getVersion should return version from podman --version output', async () => {
      runStub.resolves([`podman version ${PODMAN_VERSION}`]);
      const version: string = await podmanDependencyManager.getVersion('/usr/local/bin/podman');
      expect(version).to.equal(PODMAN_VERSION);
    });

    it('getVersion should throw error when command fails', async () => {
      runStub.rejects(new Error('Command failed'));
      try {
        await podmanDependencyManager.getVersion('/usr/local/bin/podman');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to check podman version');
      }
    });

    it('getVersion should throw error when version pattern not found', async () => {
      runStub.resolves(['Invalid output']);
      try {
        await podmanDependencyManager.getVersion('/usr/local/bin/podman');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('Failed to check podman version');
      }
    });

    it('shouldInstall should return false when Docker is installed', async () => {
      runStub.withArgs(`${constants.DOCKER} --version`).resolves(['Docker version 20.10.8']);

      // @ts-expect-error TS2341: Property shouldInstall is protected
      const result: boolean = await podmanDependencyManager.shouldInstall();
      expect(result).to.be.false;
    });

    it('shouldInstall should return true when Docker is not installed', async () => {
      runStub.withArgs(`${constants.DOCKER} --version`).rejects(new Error('Docker not found'));

      // @ts-expect-error TS2341: Property shouldInstall is protected
      const result: boolean = await podmanDependencyManager.shouldInstall();
      expect(result).to.be.true;
    });

    it('getArch should normalize architecture names', () => {
      // Test x64 to amd64 conversion
      let manager: PodmanDependencyManager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        'linux',
        'x64',
        undefined,
        undefined,
      );
      // @ts-expect-error TS2341: Property getArch is protected
      expect(manager.getArch()).to.equal('amd64');

      // Test arm64 conversion
      manager = new PodmanDependencyManager(undefined, temporaryDirectory, 'linux', 'arm64', undefined, undefined);
      // @ts-expect-error TS2341: Property getArch is protected
      expect(manager.getArch()).to.equal('arm64');

      // Test aarch64 to arm64 conversion
      manager = new PodmanDependencyManager(undefined, temporaryDirectory, 'linux', 'aarch64', undefined, undefined);
      // @ts-expect-error TS2341: Property getArch is protected
      expect(manager.getArch()).to.equal('arm64');
    });

    it('fetchLatestReleaseInfo should parse GitHub API response correctly', async () => {
      fetchStub.resolves(MOCK_GITHUB_RELEASES_RESPONSE);

      podmanDependencyManager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        'linux',
        'x64',
        undefined,
        undefined,
      );

      // @ts-expect-error TS2341: Property fetchLatestReleaseInfo is private
      const releaseInfo = await podmanDependencyManager.fetchLatestReleaseInfo();

      expect(releaseInfo.downloadUrl).to.equal(MOCK_DOWNLOAD_URL_BASE);
      expect(releaseInfo.assetName).to.equal(MOCK_LINUX_ASSET_NAME);
      expect(releaseInfo.checksum).to.equal(MOCK_CHECKSUM);
      expect(releaseInfo.version).to.equal(PODMAN_VERSION);
    });

    it('fetchLatestReleaseInfo should handle API error', async () => {
      fetchStub.resolves(MOCK_GITHUB_ERROR_RESPONSE);

      try {
        // @ts-expect-error TS2341: Property fetchLatestReleaseInfo is private
        await podmanDependencyManager.fetchLatestReleaseInfo();
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('GitHub API request failed with status 404');
      }
    });

    it('fetchLatestReleaseInfo should handle empty releases array', async () => {
      fetchStub.resolves(MOCK_GITHUB_EMPTY_RELEASES);

      try {
        // @ts-expect-error TS2341: Property fetchLatestReleaseInfo is private
        await podmanDependencyManager.fetchLatestReleaseInfo();
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('No releases found');
      }
    });

    it('fetchLatestReleaseInfo should handle no matching asset', async () => {
      fetchStub.resolves(MOCK_GITHUB_RELEASES_NO_MATCHING_ASSET);

      try {
        // @ts-expect-error TS2341: Property fetchLatestReleaseInfo is private
        await podmanDependencyManager.fetchLatestReleaseInfo();
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.include('No matching asset found for');
      }
    });
  });

  describe('when podman is installed globally', () => {
    let podmanDependencyManager: PodmanDependencyManager;
    let runStub: SinonStub;
    let cpSyncStub: SinonStub;
    let chmodSyncStub: SinonStub;
    let existsSyncStub: SinonStub;
    let rmSyncStub: SinonStub;
    let fetchStub: SinonStub;

    beforeEach(() => {
      podmanDependencyManager = new PodmanDependencyManager(
        undefined,
        temporaryDirectory,
        process.platform,
        process.arch,
        undefined,
        undefined,
      );
      podmanDependencyManager.uninstallLocal();
      runStub = sinon.stub(podmanDependencyManager, 'run');

      // Mock fetch for fetchLatestReleaseInfo
      globalThis.fetch = sinon.stub() as any;
      fetchStub = globalThis.fetch as SinonStub;

      // Configure fetch to return valid mock response
      fetchStub.resolves(MOCK_GITHUB_RELEASES_RESPONSE);

      // Add stubs for file system operations
      cpSyncStub = sinon.stub(fs, 'cpSync').returns();
      chmodSyncStub = sinon.stub(fs, 'chmodSync').returns();
      existsSyncStub = sinon.stub(fs, 'existsSync').returns(true);
      rmSyncStub = sinon.stub(fs, 'rmSync').returns();
    });

    afterEach(() => {
      runStub.restore();
      cpSyncStub.restore();
      chmodSyncStub.restore();
      existsSyncStub.restore();
      rmSyncStub.restore();
      sinon.restore();
    });

    it('should prefer the global installation if it meets the requirements', async () => {
      // @ts-expect-error TS2345: Argument of type 'shouldInstall' is not assignable to parameter of type keyof PodmanDependencyManager
      sinon.stub(podmanDependencyManager, 'shouldInstall').resolves(true);

      runStub.withArgs('which podman').resolves(['/usr/local/bin/podman']);
      runStub.withArgs('/usr/local/bin/podman --version').resolves([`podman version ${version.PODMAN_VERSION}`]);
      runStub.withArgs(`${temporaryDirectory}/podman --version`).resolves([`podman version ${version.PODMAN_VERSION}`]);
      existsSyncStub.withArgs(`${temporaryDirectory}/podman`).returns(false);

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await podmanDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.true;

      expect(await podmanDependencyManager.install(getTestCacheDirectory())).to.be.true;

      // Verify that the file system operations were called
      expect(cpSyncStub.calledOnce).to.be.true;
      // Should return global path since it meets requirements
      expect(await podmanDependencyManager.getExecutablePath()).to.equal('/usr/local/bin/podman');
    });

    it('should install podman locally if the global installation does not meet the requirements', async () => {
      runStub.withArgs('which podman').resolves(['/usr/local/bin/podman']);
      runStub.withArgs('/usr/local/bin/podman --version').resolves([`podman version ${PODMAN_LOW_VERSION}`]);
      runStub
        .withArgs(`${PathEx.join(temporaryDirectory, 'podman')} --version`)
        .resolves([`podman version ${PODMAN_LOW_VERSION}`]);
      existsSyncStub.withArgs(PathEx.join(temporaryDirectory, 'podman')).returns(true);

      // @ts-expect-error TS2341: Property isInstalledGloballyAndMeetsRequirements is private
      const result: boolean = await podmanDependencyManager.isInstalledGloballyAndMeetsRequirements();
      expect(result).to.be.false;

      expect(await podmanDependencyManager.install(getTestCacheDirectory())).to.be.true;
      expect(fs.existsSync(PathEx.join(temporaryDirectory, 'podman'))).to.be.ok;
      expect(await podmanDependencyManager.getExecutablePath()).to.equal(PathEx.join(temporaryDirectory, 'podman'));
    });
  });
});
