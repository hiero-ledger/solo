// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import zlib from 'node:zlib';
import {BaseDependencyManager} from './base-dependency-manager.js';
import {type PackageDownloader} from '../package-downloader.js';
import {SoloError} from '../errors/solo-error.js';
import {SoloErrors} from '../errors/solo-errors.js';
import {GitHubApiClient} from '../github-api-client.js';
import {type GitHubRelease, type GitHubReleaseAsset, type ReleaseInfo} from '../../types/index.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import {PathEx} from '../../business/utils/path-ex.js';

/**
 * Downloads a podman network helper binary (netavark, aardvark-dns) from its upstream
 * `containers/<helper>` GitHub release. Homebrew's podman formula does not package these two
 * helpers, so on Linux the brew-installed podman would otherwise fall through to whatever stale
 * helper the system container stack supplies. Each release publishes the helper as a single
 * gzipped `<helper>.gz` binary (Linux x86_64 only, matching Homebrew's Linux support).
 */
export abstract class PodmanNetworkHelperDependencyManager extends BaseDependencyManager {
  protected checksum: string;
  protected releaseBaseUrl: string;
  protected artifactFileName: string;
  protected artifactVersion: string;

  protected constructor(
    downloader: PackageDownloader,
    installationDirectory: string,
    osArch: string,
    requiredVersion: string,
    private readonly helperName: string,
  ) {
    super(downloader, installationDirectory, osArch, requiredVersion, helperName, '');
  }

  protected getArtifactName(): string {
    return `${this.helperName}.gz`;
  }

  /** The helpers exist only for the rootful Linux flow; every other platform runs podman in a VM. */
  public override async shouldInstall(): Promise<boolean> {
    return OperatingSystem.isLinux();
  }

  public async getVersion(executableWithPath: string): Promise<string> {
    try {
      const output: string[] = await this.run(executableWithPath, ['--version']);
      const match: RegExpMatchArray | null = output.join(' ').match(/(\d+\.\d+\.\d+)/);
      if (match) {
        return match[1];
      }
    } catch (error) {
      throw new SoloErrors.system.dependencyVersionCheckFailed(this.helperName, error);
    }
    throw new SoloErrors.system.dependencyVersionCheckFailed(this.helperName);
  }

  /**
   * Fetches the pinned release information from the GitHub API
   * @returns Promise with the release base URL, asset name, digest, and version
   */
  private async fetchReleaseInfo(tagName: string): Promise<ReleaseInfo> {
    const releasesListUrl: string = `https://api.github.com/repos/containers/${this.helperName}/releases`;
    try {
      const response: Response = await GitHubApiClient.get(releasesListUrl);
      const releases: GitHubRelease[] = await response.json();

      if (!releases || releases.length === 0) {
        throw new SoloErrors.system.gitHubReleasesNotFound();
      }

      const release: GitHubRelease = releases.find((release): boolean => release.tag_name === tagName);
      if (!release) {
        throw new SoloErrors.system.gitHubReleaseTagNotFound(tagName);
      }
      const version: string = release.tag_name.replace(/^v/, '');

      const assetName: string = `${this.helperName}.gz`;
      const matchingAsset: GitHubReleaseAsset = release.assets.find((asset): boolean => asset.name === assetName);

      if (!matchingAsset) {
        throw new SoloErrors.system.gitHubReleaseAssetNotFound(OperatingSystem.getPlatform(), assetName);
      }

      const checksum: string = matchingAsset.digest
        ? matchingAsset.digest.replace('sha256:', '')
        : '0000000000000000000000000000000000000000000000000000000000000000';

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
      throw new SoloErrors.system.githubApiResponseParseFailed(releasesListUrl, error);
    }
  }

  protected override async preInstall(): Promise<void> {
    const releaseInfo: ReleaseInfo = await this.fetchReleaseInfo(this.getRequiredVersion());
    this.checksum = releaseInfo.checksum;
    this.releaseBaseUrl = releaseInfo.downloadUrl;
    this.artifactFileName = releaseInfo.assetName;
    this.artifactVersion = releaseInfo.version;
  }

  protected getDownloadURL(): string {
    return `${this.releaseBaseUrl}/${this.artifactFileName}`;
  }

  /** The release asset is the bare binary gzipped, so decompress it to the helper's name. */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    const targetPath: string = PathEx.join(temporaryDirectory, this.helperName);
    fs.writeFileSync(targetPath, zlib.gunzipSync(fs.readFileSync(packageFilePath)));
    return [targetPath];
  }

  protected getChecksumURL(): string {
    return this.checksum;
  }
}
