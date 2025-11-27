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
import path from 'node:path';
import fs from 'node:fs';
import {Zippy} from '../zippy.js';
import {GitHubRelease, ReleaseInfo, PodmanMode} from '../../types/index.js';
import {PathEx} from '../../business/utils/path-ex.js';

const PODMAN_RELEASES_LIST_URL: string = 'https://api.github.com/repos/containers/podman/releases';

@injectable()
export class PodmanDependencyManager extends BaseDependencyManager {
  protected checksum: string;
  protected releaseBaseUrl: string;
  protected artifactFileName: string;
  protected artifactVersion: string;

  public constructor(
    @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
    @inject(InjectTokens.PodmanInstallationDir) protected override readonly installationDirectory: string,
    @inject(InjectTokens.OsPlatform) osPlatform: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.PodmanVersion) protected readonly podmanVersion: string,
    @inject(InjectTokens.Zippy) private readonly zippy: Zippy,
    @inject(InjectTokens.PodmanDependenciesInstallationDir) protected readonly helpersDirectory: string,
  ) {
    // Patch injected values to handle undefined values
    installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.PodmanInstallationDir,
      PodmanDependencyManager.name,
    );
    osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, PodmanDependencyManager.name);
    osArch = patchInject(osArch, InjectTokens.OsArch, PodmanDependencyManager.name);
    podmanVersion = patchInject(podmanVersion, InjectTokens.PodmanVersion, PodmanDependencyManager.name);
    downloader = patchInject(downloader, InjectTokens.PackageDownloader, PodmanDependencyManager.name);
    zippy = patchInject(zippy, InjectTokens.Zippy, PodmanDependencyManager.name);
    helpersDirectory = patchInject(
      helpersDirectory,
      InjectTokens.PodmanDependenciesInstallationDir,
      PodmanDependencyManager.name,
    );

    // Call the base constructor with the podman-specific parameters
    super(
      downloader,
      installationDirectory,
      osPlatform,
      osArch,
      podmanVersion || version.PODMAN_VERSION,
      constants.PODMAN,
      '',
    );
  }

  /**
   * Get the Podman artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    return util.format(this.artifactFileName, this.getRequiredVersion(), this.osPlatform, this.osArch);
  }

  public get mode(): PodmanMode {
    return this.osPlatform === constants.OS_LINUX ? PodmanMode.ROOTFUL : PodmanMode.VIRTUAL_MACHINE;
  }

  public async getVersion(executablePath: string): Promise<string> {
    // The retry logic is to handle potential transient issues with the command execution
    // The command `podman --version` was sometimes observed to return an empty output in the CI environment
    const maxAttempts: number = 3;
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output: string[] = await this.run(`${executablePath} --version`);
        if (output.length > 0) {
          const match: RegExpMatchArray | null = output[0].trim().match(/(\d+\.\d+\.\d+)/);
          return match[1];
        }
      } catch (error: any) {
        throw new SoloError('Failed to check podman version', error);
      }
    }
    throw new SoloError('Failed to check podman version');
  }

  /**
   * Fetches the latest release information from GitHub API
   * @returns Promise with the release base URL, asset name, digest, and version
   */
  private async fetchLatestReleaseInfo(): Promise<ReleaseInfo> {
    try {
      // Make a GET request to GitHub API using fetch
      const response = await fetch(PODMAN_RELEASES_LIST_URL, {
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

      // Construct asset pattern based on platform
      let assetPattern: RegExp;
      if (platform === constants.OS_WINDOWS) {
        // Windows
        assetPattern = new RegExp(String.raw`podman-remote-release-windows_${arch}\.zip$`);
      } else if (platform === 'darwin') {
        // macOS
        assetPattern = new RegExp(String.raw`podman-remote-release-darwin_${arch}\.zip$`);
      } else {
        // Linux
        assetPattern = new RegExp(String.raw`podman-remote-static-linux_${arch}\.tar\.gz$`);
      }

      // Find the matching asset
      const matchingAsset = latestRelease.assets.find(asset => assetPattern.test(asset.browser_download_url));

      if (!matchingAsset) {
        throw new SoloError(`No matching asset found for ${platform}-${arch}`);
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

  // Podman should only be installed if Docker is not already present on the client system
  public override async shouldInstall(): Promise<boolean> {
    // Check if Podman is explicitly requested via environment variable
    if (process.env.CONTAINER_ENGINE === 'podman') {
      return true;
    }

    // Determine if Docker is already installed
    try {
      await this.run(`${constants.DOCKER} --version`);
      return false;
    } catch {
      return true;
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
    // Extract the archive based on file extension
    if (packageFilePath.endsWith('.zip')) {
      this.zippy!.unzip(packageFilePath, temporaryDirectory);
    } else {
      this.zippy!.untar(packageFilePath, temporaryDirectory);
    }

    let binDirectory: string;
    if (this.osPlatform === constants.OS_LINUX) {
      binDirectory = path.join(temporaryDirectory, 'bin');
      const arch: string = this.getArch();
      fs.renameSync(
        path.join(binDirectory, `podman-remote-static-linux_${arch}`),
        path.join(binDirectory, constants.PODMAN),
      );
    } else {
      // Find the Podman executable inside the extracted directory
      binDirectory = path.join(temporaryDirectory, `${constants.PODMAN}-${this.artifactVersion}`, 'usr', 'bin');
    }

    return fs.readdirSync(binDirectory).map((file: string): string => path.join(binDirectory, file));
  }

  protected getChecksumURL(): string {
    return this.checksum;
  }

  /**
   * Create a custom containers.conf file for Podman and set the CONTAINERS_CONF env variable
   * @private
   */
  public override async setupConfig(): Promise<void> {
    // Create the containers.conf file from the template
    const configDirectory = path.join(constants.SOLO_HOME_DIR, 'config');
    if (!fs.existsSync(configDirectory)) {
      fs.mkdirSync(configDirectory, {recursive: true});
    }

    const templatesDirectory: string = PathEx.join(constants.SOLO_HOME_DIR, 'cache', 'templates');
    const templatePath: string = path.join(templatesDirectory, 'podman', 'containers.conf');
    const destinationPath: string = path.join(configDirectory, 'containers.conf');

    let configContent: string = fs.readFileSync(templatePath, 'utf8');
    configContent = configContent.replace('$HELPER_BINARIES_DIR', this.helpersDirectory.replaceAll('\\', '/'));
    fs.writeFileSync(destinationPath, configContent, 'utf-8');
    process.env.CONTAINERS_CONF = destinationPath;
  }
}
