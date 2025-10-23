// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {BaseDependencyManager} from './base-dependency-manager.js';
import {PackageDownloader} from '../package-downloader.js';
import {SoloError} from '../errors/solo-error.js';
import {GitLabRelease, GitLabReleaseSource, ReleaseInfo} from '../../types/index.js';
import path from 'node:path';
import fs from 'node:fs';
import {Zippy} from '../zippy.js';

const GITLAB_PROJECT_ID = '21523468';
const VIRTIOFSD_RELEASE_RELEASES_URL: string = `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}/releases`;
const VIRTIOFSD_RELEASE_BASE_URL: string = `https://gitlab.com/virtio-fs/virtiofsd/-/archive/${version.VIRTIOFSD_VERSION}`;

@injectable()
export class VirtiofsdDependencyManager extends BaseDependencyManager {
  protected checksum: string;
  protected releaseBaseUrl: string;
  protected artifactFileName: string;
  protected artifactVersion: string;

  public constructor(
    @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
    @inject(InjectTokens.PodmanDependenciesInstallationDir) protected override readonly installationDirectory: string,
    @inject(InjectTokens.OsPlatform) osPlatform: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.VirtiofsdVersion) protected readonly virtiofsdVersion: string,
    @inject(InjectTokens.Zippy) private readonly zippy: Zippy,
  ) {
    // Patch injected values to handle undefined values
    installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.PodmanDependenciesInstallationDir,
      VirtiofsdDependencyManager.name,
    );
    osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, VirtiofsdDependencyManager.name);
    osArch = patchInject(osArch, InjectTokens.OsArch, VirtiofsdDependencyManager.name);
    virtiofsdVersion = patchInject(virtiofsdVersion, InjectTokens.VirtiofsdVersion, VirtiofsdDependencyManager.name);
    downloader = patchInject(downloader, InjectTokens.PackageDownloader, VirtiofsdDependencyManager.name);
    zippy = patchInject(zippy, InjectTokens.Zippy, VirtiofsdDependencyManager.name);

    // Call the base constructor with the virtiofsd-specific parameters
    super(
      downloader,
      installationDirectory,
      osPlatform,
      osArch,
      virtiofsdVersion || version.VIRTIOFSD_VERSION,
      constants.VIRTIOFSD,
      '',
    );
  }

  /**
   * not used for this dependency manager
   */
  protected getArtifactName(): string {
    return '';
  }

  public async getVersion(executablePath: string): Promise<string> {
    // The retry logic is to handle potential transient issues with the command execution
    // The command `virtiofsd --version` was sometimes observed to return an empty output in the CI environment
    const maxAttempts: number = 3;
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output: string[] = await this.run(`${executablePath} --version`);
        if (output.length > 0) {
          const match: RegExpMatchArray | null = output[0].trim().match(/(\d+\.\d+\.\d+)/);
          return match[1];
        }
      } catch (error: any) {
        throw new SoloError('Failed to check virtiofsd version', error);
      }
    }
    throw new SoloError('Failed to check virtiofsd version');
  }

  private getAssetName(): string {
    return `${constants.VIRTIOFSD}-${version.VIRTIOFSD_VERSION}.tar.gz`;
  }

  public override getVerifyChecksum(): boolean {
    return false;
  }

  /**
   * Fetches the release information from GitLab API
   * @returns Promise with the release base URL, asset name, digest, and version
   */
  private async fetchReleaseInfo(): Promise<ReleaseInfo> {
    try {
      const assetName: string = this.getAssetName();

      // Make a GET request to GitLab API using fetch
      const response: Response = await fetch(`${VIRTIOFSD_RELEASE_RELEASES_URL}/${this.virtiofsdVersion}`, {
        method: 'GET',
        headers: {
          'User-Agent': constants.SOLO_USER_AGENT_HEADER,
          Accept: 'application/vnd.GitLab.v3+json', // Explicitly request GitLab API v3 format
        },
      });

      if (!response.ok) {
        throw new SoloError(`GitLab API request failed with status ${response.status}`);
      }

      // Parse the JSON response
      const release: GitLabRelease = await response.json();
      const version: string = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present

      // example description: "[virtiofsd-v1.13.2.zip](/uploads/0298165d4cd2c73ca444a8c0f6a9ecc7/virtiofsd-v1.13.2.zip)"
      // matches the text between the parentheses
      const match: RegExpMatchArray = release.description.match(/\[.*?\]\((.*?)\)/);
      // const downloadUrl: string = match ? `${VIRTIOFSD_RELEASE_BASE_URL}${match[1]}` : null;
      const downloadUrl: string = VIRTIOFSD_RELEASE_BASE_URL;

      const matchingSource: GitLabReleaseSource = release.assets.sources.find(asset => asset.format === 'tar.gz');

      if (!matchingSource) {
        throw new SoloError(`No matching asset source found (${assetName})`);
      }

      // Get the digest
      const checksum: string = '0000000000000000000000000000000000000000000000000000000000000000';

      // Construct the release base URL (removing the filename from the download URL)
      // const downloadUrl: string = matchingSource.url;

      return {
        downloadUrl,
        assetName,
        checksum,
        version,
      };
    } catch (error) {
      if (error instanceof SoloError) {
        throw error;
      }
      throw new SoloError('Failed to parse GitLab API response', error);
    }
  }

  // Virtiofsd is only required on Linux
  public override async shouldInstall(): Promise<boolean> {
    return this.osPlatform === constants.OS_LINUX;
  }

  protected override async preInstall(): Promise<void> {
    const releaseInfo: ReleaseInfo = await this.fetchReleaseInfo();
    this.checksum = releaseInfo.checksum;
    this.releaseBaseUrl = releaseInfo.downloadUrl;
    this.artifactFileName = releaseInfo.assetName;
    this.artifactVersion = releaseInfo.version;
  }

  protected getDownloadURL(): string {
    return `${this.releaseBaseUrl}/${this.artifactFileName}`;
  }

  /**
   * Handle any post-download processing before copying to destination
   * Child classes can override this for custom extraction or processing
   */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    // Extract the archive
    this.zippy!.unzip(packageFilePath, temporaryDirectory);
    const binDirectory: string = path.join(temporaryDirectory, 'target', 'x86_64-unknown-linux-musl', 'release');
    return fs.readdirSync(binDirectory).map((file: string): string => path.join(binDirectory, file));
  }

  protected getChecksumURL(): string {
    return this.checksum;
  }
}
