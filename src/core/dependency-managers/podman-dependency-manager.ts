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
import {PathEx} from '../../business/utils/path-ex.js';
import {Zippy} from '../zippy.js';

const PODMAN_RELEASE_BASE_URL: string = 'https://github.com/containers/podman/releases/download/v5.6.0/';
const PODMAN_ARTIFACT_TEMPLATE: string = 'podman-installer-macos-arm64.pkg';

@injectable()
export class PodmanDependencyManager extends BaseDependencyManager {
  public constructor(
    @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
    @inject(InjectTokens.PodmanInstallationDir) protected override readonly installationDirectory: string,
    @inject(InjectTokens.OsPlatform) osPlatform: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.PodmanVersion) protected readonly podmanVersion: string,
    @inject(InjectTokens.Zippy) private readonly zippy: Zippy,
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

    // Call the base constructor with the podman-specific parameters
    super(
      downloader,
      installationDirectory,
      osPlatform,
      osArch,
      podmanVersion || version.PODMAN_VERSION,
      constants.PODMAN,
      PODMAN_RELEASE_BASE_URL,
    );
  }

  /**
   * Get the Podman artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    return util.format(PODMAN_ARTIFACT_TEMPLATE, this.getRequiredVersion(), this.osPlatform, this.osArch);
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

  protected getDownloadURL(): string {
    return `${this.downloadBaseUrl}/${this.artifactName}`;
  }

  /**
   * Handle any post-download processing before copying to destination
   * Child classes can override this for custom extraction or processing
   */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string> {
    // Extract the archive
    if (this.osPlatform === constants.OS_WINDOWS) {
      this.zippy!.unzip(packageFilePath, temporaryDirectory);
    } else {
      this.zippy!.untar(packageFilePath, temporaryDirectory);
    }

    // Find the Podman executable inside the extracted directory
    const podmanExecutablePath: string = path.join(
      temporaryDirectory,
      `${this.osPlatform}-${this.osArch}`,
      this.osPlatform === constants.OS_WINDOWS ? `${constants.PODMAN}.exe` : constants.PODMAN,
    );

    // Ensure the extracted file exists
    if (!fs.existsSync(podmanExecutablePath)) {
      const executablePath: string = PathEx.join(
        temporaryDirectory,
        this.osPlatform === constants.OS_WINDOWS ? `${constants.PODMAN}.exe` : constants.PODMAN,
      );

      if (!fs.existsSync(executablePath)) {
        throw new Error(`Helm executable not found in extracted archive: ${executablePath}`);
      }

      return executablePath;
    }

    return podmanExecutablePath;
  }

  protected getChecksumURL(): string {
    return `04a9eb3b0d5056cd9f1e9d57c9c7128b93d7d65815f7945d6d868c4e5fa14ddc`;
  }
}
