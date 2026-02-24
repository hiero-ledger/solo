// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {BaseDependencyManager} from './base-dependency-manager.js';
import {PackageDownloader} from '../package-downloader.js';
import util from 'node:util';
import {SoloError} from '../errors/solo-error.js';
import {GitHubRelease, GitHubReleaseAsset, ReleaseInfo} from '../../types/index.js';
import fs from 'node:fs';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import {PathEx} from '../../business/utils/path-ex.js';

const GVPROXY_RELEASES_LIST_URL: string = 'https://api.github.com/repos/containers/gvisor-tap-vsock/releases';

@injectable()
export class GvproxyDependencyManager extends BaseDependencyManager {
  protected checksum: string;
  protected releaseBaseUrl: string;
  protected artifactFileName: string;
  protected artifactVersion: string;

  public constructor(
    @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
    @inject(InjectTokens.PodmanDependenciesInstallationDirectory)
    protected override readonly installationDirectory: string,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.GvproxyVersion) protected readonly gvproxyVersion: string,
  ) {
    // Patch injected values to handle undefined values
    installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.PodmanDependenciesInstallationDirectory,
      GvproxyDependencyManager.name,
    );
    osArch = patchInject(osArch, InjectTokens.OsArch, GvproxyDependencyManager.name);
    gvproxyVersion = patchInject(gvproxyVersion, InjectTokens.GvproxyVersion, GvproxyDependencyManager.name);
    downloader = patchInject(downloader, InjectTokens.PackageDownloader, GvproxyDependencyManager.name);

    // Call the base constructor with the gvproxy-specific parameters
    super(downloader, installationDirectory, osArch, gvproxyVersion || version.GVPROXY_VERSION, constants.GVPROXY, '');
  }

  /**
   * Get the Gvproxy artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    return util.format(
      this.artifactFileName,
      this.getRequiredVersion(),
      OperatingSystem.getFormattedPlatform(),
      this.osArch,
    );
  }

  public async getVersion(executableWithPath: string): Promise<string> {
    // The retry logic is to handle potential transient issues with the command execution
    // The command `gvproxy --version` was sometimes observed to return an empty output in the CI environment
    const maxAttempts: number = 3;
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output: string[] = await this.run(`"${executableWithPath}" --version`);
        if (output.length > 0) {
          const match: RegExpMatchArray | null = output[0].trim().match(/(\d+\.\d+\.\d+)/);
          return match[1];
        }
      } catch (error: any) {
        throw new SoloError('Failed to check gvproxy version', error);
      }
    }
    throw new SoloError('Failed to check gvproxy version');
  }

  /**
   * Determine the appropriate asset name for the current platform and architecture
   * based on the naming conventions used in gvproxy GitHub releases
   */
  private getAssetName(): string {
    // Normalize platform/arch for asset matching
    const arch: string = this.getArch();

    // Select the appropriate asset name based on platform and architecture
    let assetName: string;

    if (OperatingSystem.isWin32()) {
      // For Windows, use the regular exe (not the GUI version)
      assetName = arch === 'arm64' ? 'gvproxy-windows-arm64.exe' : 'gvproxy-windows.exe';
    } else if (OperatingSystem.isDarwin()) {
      assetName = 'gvproxy-darwin';
    } else if (OperatingSystem.isLinux()) {
      assetName = `gvproxy-linux-${arch}`;
    } else {
      throw new SoloError(`Unsupported platform: ${OperatingSystem.getPlatform()}`);
    }

    return assetName;
  }

  /**
   * Fetches the latest release information from GitHub API
   * @returns Promise with the release base URL, asset name, digest, and version
   */
  private async fetchReleaseInfo(tagName: string): Promise<ReleaseInfo> {
    try {
      // Make a GET request to GitHub API using fetch
      const response = await fetch(GVPROXY_RELEASES_LIST_URL, {
        method: 'GET',
        headers: {
          'User-Agent': constants.SOLO_USER_AGENT_HEADER,
          Accept: 'application/vnd.github.v3+json', // Explicitly request GitHub API v3 format
        },
      });

      if (!response.ok) {
        throw new SoloError(`GitHub API request failed with status ${response.status}`);
      }

      // Parse the JSON response
      const releases: GitHubRelease[] = await response.json();

      if (!releases || releases.length === 0) {
        throw new SoloError('No releases found');
      }

      // Get the latest release
      const release: GitHubRelease = releases.find(release => release.tag_name === tagName);
      const version: string = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present

      const assetName: string = this.getAssetName();

      const matchingAsset: GitHubReleaseAsset = release.assets.find(asset => asset.name === assetName);

      if (!matchingAsset) {
        throw new SoloError(`No matching asset found (${assetName})`);
      }

      // Get the digest from the shasums file
      const checksum: string = matchingAsset.digest
        ? matchingAsset.digest.replace('sha256:', '')
        : '0000000000000000000000000000000000000000000000000000000000000000';

      // Construct the release base URL (removing the filename from the download URL)
      const downloadUrl: string = matchingAsset.browser_download_url.slice(
        0,
        Math.max(0, matchingAsset.browser_download_url.lastIndexOf('/')),
      );

      return {
        downloadUrl,
        assetName: matchingAsset.name,
        checksum,
        version,
      };
    } catch (error) {
      if (error instanceof SoloError) {
        throw error;
      }
      throw new SoloError('Failed to parse GitHub API response', error);
    }
  }

  protected override async preInstall(): Promise<void> {
    const latestReleaseInfo: ReleaseInfo = await this.fetchReleaseInfo(version.GVPROXY_VERSION);
    this.checksum = latestReleaseInfo.checksum;
    this.releaseBaseUrl = latestReleaseInfo.downloadUrl;
    this.artifactFileName = latestReleaseInfo.assetName;
    this.artifactVersion = latestReleaseInfo.version;
  }

  protected getDownloadURL(): string {
    return `${this.releaseBaseUrl}/${this.artifactFileName}`;
  }

  /**
   * Handle any post-download processing before copying to destination
   * Child classes can override this for custom extraction or processing
   */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    // Determine the target filename based on the platform
    const targetFileName: string = OperatingSystem.isWin32() ? 'gvproxy.exe' : 'gvproxy';
    const targetPath: string = PathEx.join(temporaryDirectory, targetFileName);

    // Rename the downloaded file
    fs.renameSync(packageFilePath, targetPath);

    return [targetPath];
  }

  protected getChecksumURL(): string {
    return this.checksum;
  }
}
