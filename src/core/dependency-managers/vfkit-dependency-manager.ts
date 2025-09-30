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
import {GitHubRelease, ReleaseInfo} from '../../types/index.js';

const VFKIT_RELEASES_LIST_URL: string = 'https://api.github.com/repos/crc-org/vfkit/releases';

@injectable()
export class VfkitDependencyManager extends BaseDependencyManager {
  protected checksum: string;
  protected releaseBaseUrl: string;
  protected artifactFileName: string;
  protected artifactVersion: string;

  public constructor(
    @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
    @inject(InjectTokens.VfkitInstallationDir) protected override readonly installationDirectory: string,
    @inject(InjectTokens.OsPlatform) osPlatform: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.VfkitVersion) protected readonly vfkitVersion: string,
  ) {
    // Patch injected values to handle undefined values
    installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.VfkitInstallationDir,
      VfkitDependencyManager.name,
    );
    osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, VfkitDependencyManager.name);
    osArch = patchInject(osArch, InjectTokens.OsArch, VfkitDependencyManager.name);
    vfkitVersion = patchInject(vfkitVersion, InjectTokens.VfkitVersion, VfkitDependencyManager.name);
    downloader = patchInject(downloader, InjectTokens.PackageDownloader, VfkitDependencyManager.name);

    // Call the base constructor with the vfkit-specific parameters
    super(
      downloader,
      installationDirectory,
      osPlatform,
      osArch,
      vfkitVersion || version.VFKIT_VERSION,
      constants.VFKIT,
      '',
    );
  }

  public override getVerifyChecksum(): boolean {
    return false;
  }

  /**
   * Get the Vfkit artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    return util.format(this.artifactFileName, this.getRequiredVersion(), this.osPlatform, this.osArch);
  }

  public async getVersion(executablePath: string): Promise<string> {
    // The retry logic is to handle potential transient issues with the command execution
    // The command `vfkit --version` was sometimes observed to return an empty output in the CI environment
    const maxAttempts: number = 3;
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output: string[] = await this.run(`${executablePath} --version`);
        if (output.length > 0) {
          const match: RegExpMatchArray | null = output[0].trim().match(/(\d+\.\d+\.\d+)/);
          return match[1];
        }
      } catch (error: any) {
        throw new SoloError('Failed to check vfkit version', error);
      }
    }
    throw new SoloError('Failed to check vfkit version');
  }

  /**
   * Fetches the latest release information from GitHub API
   * @returns Promise with the release base URL, asset name, digest, and version
   */
  private async fetchLatestReleaseInfo(): Promise<ReleaseInfo> {
    try {
      // Make a GET request to GitHub API using fetch
      const response = await fetch(VFKIT_RELEASES_LIST_URL, {
        method: 'GET', // Changed from HEAD to GET to retrieve the body
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
      const latestRelease = releases[0];
      const version = latestRelease.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present

      // Normalize platform/arch for asset matching
      const platform = this.osPlatform === constants.OS_WIN32 ? constants.OS_WINDOWS : this.osPlatform;
      const arch: string = this.getArch();

      const assetName = `vfkit`;
      const matchingAsset = latestRelease.assets.find(asset => asset.name === assetName);

      if (!matchingAsset) {
        throw new SoloError(`No matching asset found for ${platform}-${arch}`);
      }

      const checksum: string =
        matchingAsset.digest || '0000000000000000000000000000000000000000000000000000000000000000';

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
    const latestReleaseInfo: ReleaseInfo = await this.fetchLatestReleaseInfo();
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
    return [packageFilePath];
  }

  protected getChecksumURL(): string {
    return this.checksum;
  }
}
