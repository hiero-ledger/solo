// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {GitHubReleaseDependencyManager} from './github-release-dependency-manager.js';
import {PackageDownloader} from '../package-downloader.js';
import {Zippy} from '../zippy.js';
import {PathEx} from '../../business/utils/path-ex.js';
import fs from 'node:fs';
import {SoloErrors} from '../errors/solo-errors.js';
import {type GitHubReleaseAsset} from '../../types/index.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';

@injectable()
export class CraneDependencyManager extends GitHubReleaseDependencyManager {
  protected readonly releasesListUrl: string = 'https://api.github.com/repos/google/go-containerregistry/releases';

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
    );

    this.zippy = patchInject(this.zippy, InjectTokens.Zippy, CraneDependencyManager.name);
  }

  protected override getVersionArguments(): string[] {
    return ['version'];
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
      throw new SoloErrors.validation.illegalArgument(`Unsupported platform: ${OperatingSystem.getPlatform()}`);
    }

    // Prefer archives; support both tar.gz and zip if upstream ever varies by platform/version.
    return new RegExp(String.raw`go-containerregistry_${platformPattern}_${normalizedArch}\.(tar\.gz|zip)$`, 'i');
  }

  protected isMatchingAsset(asset: GitHubReleaseAsset): boolean {
    const assetPattern: RegExp = this.getAssetPattern();
    return assetPattern.test(asset.name) || assetPattern.test(asset.browser_download_url);
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
      throw new SoloErrors.system.dependencyInstallFailed(
        'crane',
        new Error(`Crane executable not found in extracted archive: ${temporaryDirectory}`),
      );
    }

    return [matchedPath];
  }
}
