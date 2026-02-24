// SPDX-License-Identifier: Apache-2.0

import * as constants from '../constants.js';
import * as version from '../../../version.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {BaseDependencyManager} from './base-dependency-manager.js';
import {Zippy} from '../zippy.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {PackageDownloader} from '../package-downloader.js';
import util from 'node:util';
import fs from 'node:fs';
import {SoloError} from '../errors/solo-error.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';

const HELM_RELEASE_BASE_URL: string = 'https://get.helm.sh';
const HELM_ARTIFACT_TEMPLATE: string = 'helm-%s-%s-%s.%s';

/**
 * Helm dependency manager installs or uninstalls helm client at SOLO_HOME_DIR/bin directory
 */
@injectable()
export class HelmDependencyManager extends BaseDependencyManager {
  public constructor(
    @inject(InjectTokens.PackageDownloader) downloader?: PackageDownloader,
    @inject(InjectTokens.Zippy) private readonly zippy?: Zippy,
    @inject(InjectTokens.HelmInstallationDirectory) installationDirectory?: string,
    @inject(InjectTokens.OsArch) osArch?: string,
    @inject(InjectTokens.HelmVersion) helmVersion?: string,
  ) {
    // Patch injected values to handle undefined values
    installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.HelmInstallationDirectory,
      HelmDependencyManager.name,
    );
    osArch = patchInject(osArch, InjectTokens.OsArch, HelmDependencyManager.name);
    helmVersion = patchInject(helmVersion, InjectTokens.HelmVersion, HelmDependencyManager.name);
    downloader = patchInject(downloader, InjectTokens.PackageDownloader, HelmDependencyManager.name);

    // Call the base constructor with the Helm-specific parameters
    super(
      downloader,
      installationDirectory,
      osArch,
      helmVersion || version.HELM_VERSION,
      constants.HELM,
      HELM_RELEASE_BASE_URL,
    );

    this.zippy = patchInject(zippy, InjectTokens.Zippy, HelmDependencyManager.name);
  }

  /**
   * Get the Helm artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    const fileExtension: string = OperatingSystem.isWin32() ? 'zip' : 'tar.gz';
    return util.format(
      HELM_ARTIFACT_TEMPLATE,
      this.getRequiredVersion(),
      OperatingSystem.getFormattedPlatform(),
      this.osArch,
      fileExtension,
    );
  }

  /**
   * Process the downloaded Helm package by extracting it and finding the executable
   */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    // Extract the archive
    if (OperatingSystem.isWin32()) {
      this.zippy!.unzip(packageFilePath, temporaryDirectory);
    } else {
      this.zippy!.untar(packageFilePath, temporaryDirectory);
    }

    // Find the Helm executable inside the extracted directory
    const helmExecutablePath: string = PathEx.join(
      temporaryDirectory,
      `${OperatingSystem.getFormattedPlatform()}-${this.osArch}`,
      this.executableName,
    );

    // Ensure the extracted file exists
    if (!fs.existsSync(helmExecutablePath)) {
      const executablePath: string = PathEx.join(temporaryDirectory, this.executableName);

      if (!fs.existsSync(executablePath)) {
        throw new Error(`Helm executable not found in extracted archive: ${executablePath}`);
      }

      return [executablePath];
    }

    return [helmExecutablePath];
  }

  public async getVersion(executableWithPath: string): Promise<string> {
    try {
      const output: string[] = await this.run(`"${executableWithPath}" version --short`);
      const parts: string[] = output[0].split('+');
      const versionOnly: string = parts[0];
      this.logger.info(`Helm version: ${versionOnly}`);
      this.logger.debug(`Found ${constants.HELM}:${versionOnly}`);
      return versionOnly;
    } catch (error) {
      throw new SoloError('Failed to check helm version', error);
    }
  }

  protected getDownloadURL(): string {
    return `${this.downloadBaseUrl}/${this.artifactName}`;
  }

  protected getChecksumURL(): string {
    return `${this.downloadURL}.sha256sum`;
  }
}
