// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {BaseDependencyManager} from './base-dependency-manager.js';
import {PackageDownloader} from '../package-downloader.js';
import {Zippy} from '../zippy.js';
import {PathEx} from '../../business/utils/path-ex.js';
import util from 'node:util';
import fs from 'node:fs';
import {SoloError} from '../errors/solo-error.js';
import {GitHubRelease, GitHubReleaseAsset, ReleaseInfo} from '../../types/index.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';

const CRANE_RELEASES_LIST_URL: string = 'https://api.github.com/repos/google/go-containerregistry/releases';

@injectable()
export class CraneDependencyManager extends BaseDependencyManager {
  protected checksum: string;
  protected releaseBaseUrl: string;
  protected artifactFileName: string;
  protected artifactVersion: string;

  public constructor(
    @inject(InjectTokens.PackageDownloader) downloader: PackageDownloader,
    @inject(InjectTokens.Zippy) private readonly zippy: Zippy,
    @inject(InjectTokens.CraneInstallationDirectory) installationDirectory: string,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.CraneVersion) craneVersion: string,
  ) {
    super(
      patchInject(downloader, InjectTokens.PackageDownloader, CraneDependencyManager.name),
      patchInject(installationDirectory, InjectTokens.CraneInstallationDirectory, CraneDependencyManager.name),
      patchInject(osArch, InjectTokens.OsArch, CraneDependencyManager.name),
      patchInject(craneVersion, InjectTokens.CraneVersion, CraneDependencyManager.name) || version.CRANE_VERSION,
      constants.CRANE,
      '',
    );

    this.zippy = patchInject(this.zippy, InjectTokens.Zippy, CraneDependencyManager.name);
  }

  /**
   * This class uses GitHub release discovery in preInstall(), so the artifact name
   * is determined dynamically from the matching asset.
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
    const maxAttempts: number = 3;

    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output: string[] = await this.run(`"${executableWithPath}" version`);
        if (output.length > 0) {
          const joined: string = output.join('\n').trim();
          const match: RegExpMatchArray | null = joined.match(/(\d+\.\d+\.\d+)/);
          if (match && match[1]) {
            return match[1];
          }
        }
      } catch (error) {
        throw new SoloError('Failed to check crane version', error);
      }
    }

    throw new SoloError('Failed to check crane version');
  }

  /**
   * Match the release asset name for the current platform and architecture.
   *
   * Release examples observed publicly include:
   * - go-containerregistry_Linux_x86_64.tar.gz
   * - go-containerregistry_darwin_arm64.tar.gz
   *
   * We use a case-insensitive regex because historical naming appears to vary in capitalization.
   */
  private getAssetPattern(): RegExp {
    const arch: string = this.getArch();

    let normalizedArch: string;
    if (arch === 'amd64') {
      normalizedArch = '(amd64|x86_64)';
    } else if (arch === 'arm64') {
      normalizedArch = 'arm64';
    } else {
      normalizedArch = arch;
    }

    let platformPattern: string;
    if (OperatingSystem.isWin32()) {
      platformPattern = 'windows';
    } else if (OperatingSystem.isDarwin()) {
      platformPattern = 'darwin';
    } else if (OperatingSystem.isLinux()) {
      platformPattern = 'linux';
    } else {
      throw new SoloError(`Unsupported platform: ${OperatingSystem.getPlatform()}`);
    }

    // Prefer archives; support both tar.gz and zip if upstream ever varies by platform/version.
    return new RegExp(String.raw`go-containerregistry_${platformPattern}_${normalizedArch}\.(tar\.gz|zip)$`, 'i');
  }

  private async fetchReleaseInfo(tagName: string): Promise<ReleaseInfo> {
    try {
      const response: Response = await fetch(CRANE_RELEASES_LIST_URL, {
        method: 'GET',
        headers: {
          'User-Agent': constants.SOLO_USER_AGENT_HEADER,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new SoloError(`GitHub API request failed with status ${response.status}`);
      }

      const releases: GitHubRelease[] = await response.json();
      if (!releases || releases.length === 0) {
        throw new SoloError('No releases found');
      }

      const release: GitHubRelease | undefined = releases.find((release_): boolean => release_.tag_name === tagName);
      if (!release) {
        throw new SoloError(`Release not found for tag ${tagName}`);
      }

      const versionOnly: string = release.tag_name.replace(/^v/, '');
      const assetPattern: RegExp = this.getAssetPattern();
      const matchingAsset: GitHubReleaseAsset | undefined = release.assets.find(
        (asset): boolean => assetPattern.test(asset.name) || assetPattern.test(asset.browser_download_url),
      );

      if (!matchingAsset) {
        throw new SoloError(
          `No matching crane asset found for ${OperatingSystem.getFormattedPlatform()}-${this.getArch()}`,
        );
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
        version: versionOnly,
      };
    } catch (error) {
      if (error instanceof SoloError) {
        throw error;
      }
      throw new SoloError('Failed to parse GitHub API response', error);
    }
  }

  protected override async preInstall(): Promise<void> {
    const releaseInfo: ReleaseInfo = await this.fetchReleaseInfo(version.CRANE_VERSION);
    this.checksum = releaseInfo.checksum;
    this.releaseBaseUrl = releaseInfo.downloadUrl;
    this.artifactFileName = releaseInfo.assetName;
    this.artifactVersion = releaseInfo.version;
  }

  protected getDownloadURL(): string {
    return `${this.releaseBaseUrl}/${this.artifactFileName}`;
  }

  protected getChecksumURL(): string {
    return this.checksum;
  }

  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    if (packageFilePath.endsWith('.zip')) {
      this.zippy!.unzip(packageFilePath, temporaryDirectory);
    } else {
      this.zippy!.untar(packageFilePath, temporaryDirectory);
    }

    const executableName: string = OperatingSystem.isWin32() ? 'crane.exe' : 'crane';

    const candidatePaths: string[] = [
      PathEx.join(temporaryDirectory, executableName),
      PathEx.join(temporaryDirectory, 'crane', executableName),
      PathEx.join(temporaryDirectory, 'go-containerregistry', executableName),
    ];

    const matchedPath: string | undefined = candidatePaths.find((candidate): boolean => fs.existsSync(candidate));

    if (!matchedPath) {
      throw new SoloError(`Crane executable not found in extracted archive: ${temporaryDirectory}`);
    }

    return [matchedPath];
  }
}
