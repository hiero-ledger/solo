// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import * as helpers from '../helpers.js';
import {type PackageDownloader} from '../package-downloader.js';
import {Templates} from '../templates.js';
import {ShellRunner} from '../shell-runner.js';
import * as semver from 'semver';
import {MissingArgumentError} from '../errors/missing-argument-error.js';
import {SoloError} from '../errors/solo-error.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import path from 'node:path';

/**
 * Base class for dependency managers that download and manage CLI tools
 * Common functionality for downloading, checking versions, and managing executables
 */
export abstract class BaseDependencyManager extends ShellRunner {
  protected readonly osArch: string;
  protected localExecutableWithPath: string;
  protected globalExecutablePath: string = '';
  protected readonly artifactName: string;
  protected readonly downloadURL: string;
  protected readonly checksumURL: string;
  protected readonly executableName: string;

  protected constructor(
    protected readonly downloader: PackageDownloader,
    protected readonly installationDirectory: string,
    osArch: string,
    protected readonly requiredVersion: string,
    dependencyName: string,
    protected readonly downloadBaseUrl: string,
  ) {
    super();

    if (!installationDirectory) {
      throw new MissingArgumentError('installation directory is required');
    }

    if (!downloader) {
      throw new MissingArgumentError('package downloader is required');
    }

    // Normalize architecture naming - many tools use 'amd64' instead of 'x64'
    this.osArch = ['x64', 'x86-64'].includes(osArch as string) ? 'amd64' : (osArch as string);

    // Set the path to the local installation
    this.localExecutableWithPath = Templates.localInstallationExecutableForDependency(
      dependencyName,
      installationDirectory,
    );
    this.executableName = path.basename(this.localExecutableWithPath);

    // Set artifact name and URLs - these will be overridden by child classes
    this.artifactName = this.getArtifactName();
    this.downloadURL = this.getDownloadURL();
    this.checksumURL = this.getChecksumURL();
  }

  protected getArch(): string {
    let arch: string = this.osArch;
    if (arch === 'x64') {
      arch = 'amd64';
    } else if (arch === 'arm64' || arch === 'aarch64') {
      arch = 'arm64';
    }
    return arch;
  }

  /**
   * Child classes must implement this to generate the correct artifact name
   * based on version, platform, and architecture
   */
  protected abstract getArtifactName(): string;

  /**
   * Get the download URL for the executable
   */
  protected abstract getDownloadURL(): string;

  /**
   * Get the checksum URL for the executable
   */
  protected abstract getChecksumURL(): string;

  public abstract getVersion(executablePath: string): Promise<string>;

  /**
   * Handle any post-download processing before copying to destination
   * Child classes can override this for custom extraction or processing
   */
  protected abstract processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]>;

  /**
   * Get the executable to run
   */
  public async getExecutable(): Promise<string> {
    return this.executableName;
  }

  /**
   * Find the global executable using 'which' or 'where' command
   */
  private async getGlobalExecutableWithPath(): Promise<false | string> {
    try {
      if (this.globalExecutablePath) {
        return this.globalExecutablePath;
      }
      const cmd: string = OperatingSystem.isWin32() ? 'where' : 'which';
      const path: string[] = await this.run(`${cmd} ${this.executableName}`);
      if (path.length === 0) {
        return false;
      }
      this.globalExecutablePath = path[0];
      return path[0];
    } catch {
      return false;
    }
  }

  /**
   * Check if the given installation meets version requirements
   */
  public async installationMeetsRequirements(executableWithPath: string): Promise<boolean> {
    let version: string;
    try {
      version = await this.getVersion(executableWithPath);
    } catch (error) {
      this.logger.debug(
        `Failed to get version for ${this.executableName} at ${executableWithPath}: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
    if (semver.gte(version, this.getRequiredVersion())) {
      return true;
    }
    this.logger.info(
      `Found version ${version} of ${this.executableName} at ${executableWithPath}, which does not meet the required version ${this.getRequiredVersion()}`,
    );
    return false;
  }

  /**
   * Check if the tool is installed globally and meets requirements
   */
  private async isInstalledGloballyAndMeetsRequirements(): Promise<boolean> {
    const path: false | string = await this.getGlobalExecutableWithPath();
    try {
      if (path && (await this.installationMeetsRequirements(path))) {
        return true;
      }
    } catch (error) {
      this.logger.debug(
        `Global installation of ${this.executableName} does not meet version requirements: ${error instanceof Error ? error.message : error}`,
      );
    }
    return false;
  }
  /**
   * Check if the tool is installed locally and meets requirements
   */
  private async isInstalledLocallyAndMeetsRequirements(): Promise<boolean> {
    try {
      if (this.isInstalledLocally() && (await this.installationMeetsRequirements(this.localExecutableWithPath))) {
        return true;
      }
    } catch (error) {
      this.logger.debug(
        `Local installation of ${this.executableName} does not meet version requirements: ${error instanceof Error ? error.message : error}`,
      );
    }
    return false;
  }

  /**
   * Check if the tool is installed locally
   */
  public isInstalledLocally(): boolean {
    return fs.existsSync(this.localExecutableWithPath);
  }

  /**
   * Uninstall the local version
   */
  public uninstallLocal(): void {
    if (this.isInstalledLocally()) {
      fs.rmSync(this.localExecutableWithPath);
    }
  }

  /**
   * Hook for any pre-installation steps
   */
  protected async preInstall(): Promise<void> {}

  /**
   * Hook to determine if installation should proceed
   * Child classes can override this for custom logic
   */
  public async shouldInstall(): Promise<boolean> {
    return true;
  }

  /**
   * Determine if checksum verification should be performed
   * Child classes can override this if needed
   */
  public getVerifyChecksum(): boolean {
    return true;
  }

  /**
   * Install the tool
   */
  public async install(temporaryDirectory: string = helpers.getTemporaryDirectory()): Promise<boolean> {
    if (this.installationDirectory === temporaryDirectory) {
      throw new SoloError('Installation directory cannot be the same as temporary directory');
    }
    if (!(await this.shouldInstall())) {
      this.logger.debug(`Skipping installation of ${this.executableName}`);
      return true;
    }

    await this.preInstall();

    // Check if it is already installed locally
    if (await this.isInstalledLocallyAndMeetsRequirements()) {
      this.logger.debug(
        `${this.executableName} is installed at ${this.installationDirectory} and meets version requirements.`,
      );
      return true;
    }

    // If it is installed globally and meets requirements, use the global installation
    if (await this.isInstalledGloballyAndMeetsRequirements()) {
      this.logger.debug(`${this.executableName} is installed at globally and meets version requirements.`);
      return true;
    }

    // If not installed, download and install
    this.logger.debug(`Downloading and installing ${this.executableName} executable...`);
    const packageFile: string = await this.downloader!.fetchPackage(
      this.getDownloadURL(),
      this.getChecksumURL(),
      temporaryDirectory,
      this.getVerifyChecksum(),
    );

    const processedFiles: string[] = await this.processDownloadedPackage(packageFile, temporaryDirectory);

    if (!fs.existsSync(this.installationDirectory!)) {
      fs.mkdirSync(this.installationDirectory!, {recursive: true});
    }

    // In case there is an existing local installation, which did not meet the requirements - remove it
    this.uninstallLocal();

    try {
      for (const processedFile of processedFiles) {
        const fileName: string = path.basename(processedFile);
        const localExecutable: string = PathEx.join(this.installationDirectory, fileName);
        fs.cpSync(processedFile, localExecutable);
        fs.chmodSync(localExecutable, 0o755);
      }
    } catch (error) {
      throw new SoloError(`Failed to install ${this.executableName}: ${error.message}`);
    }

    return this.isInstalledLocally();
  }

  /**
   * Get the tool's required version
   */
  public getRequiredVersion(): string {
    return this.requiredVersion as string;
  }

  /**
   * Hook for setting up any configuration after installation
   * Child classes can override this if needed
   */
  public setupConfig(): void {}
}
