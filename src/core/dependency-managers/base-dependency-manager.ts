// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import * as helpers from '../helpers.js';
import * as constants from '../constants.js';
import {type PackageDownloader} from '../package-downloader.js';
import {Templates} from '../templates.js';
import {ShellRunner} from '../shell-runner.js';
import * as semver from 'semver';
import {OS_WIN32, OS_WINDOWS} from '../constants.js';
import {MissingArgumentError} from '../errors/missing-argument-error.js';
import {SoloError} from '../errors/solo-error.js';
import {PathEx} from '../../business/utils/path-ex.js';

/**
 * Base class for dependency managers that download and manage CLI tools
 * Common functionality for downloading, checking versions, and managing executables
 */
export abstract class BaseDependencyManager extends ShellRunner {
  protected readonly osPlatform: string;
  protected readonly osArch: string;
  protected localExecutablePath: string;
  protected globalExecutablePath: string = '';
  protected readonly artifactName: string;
  protected readonly downloadURL: string;
  protected readonly checksumURL: string;

  protected constructor(
    protected readonly downloader: PackageDownloader,
    protected readonly installationDirectory: string,
    osPlatform: NodeJS.Platform,
    osArch: string,
    protected readonly requiredVersion: string,
    protected readonly executableName: string,
    protected readonly downloadBaseUrl: string,
  ) {
    super();

    if (!installationDirectory) {
      throw new MissingArgumentError('installation directory is required');
    }

    // Node.js uses 'win32' for windows but many tools use 'windows'
    this.osPlatform = osPlatform === OS_WIN32 ? OS_WINDOWS : (osPlatform as string);

    // Normalize architecture naming - many tools use 'amd64' instead of 'x64'
    this.osArch = ['x64', 'x86-64'].includes(osArch as string) ? 'amd64' : (osArch as string);

    // Set the path to the local installation
    this.localExecutablePath = Templates.installationPath(executableName, this.osPlatform, installationDirectory);

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
   * Get the path to the executable (global or local)
   */
  public async getExecutablePath(): Promise<string> {
    // First check if global installation exists and meets requirements
    const globalPath: false | string = await this.getGlobalExecutablePath();
    if (globalPath && (await this.installationMeetsRequirements(globalPath))) {
      return globalPath;
    }

    // Fall back to local installation
    this.logger.debug(`Using local installation of ${this.executableName} at ${this.localExecutablePath}`);
    return this.localExecutablePath;
  }

  /**
   * Find the global executable using 'which' or 'where' command
   */
  private async getGlobalExecutablePath(): Promise<false | string> {
    try {
      if (this.globalExecutablePath) {
        return this.globalExecutablePath;
      }
      const cmd: string = this.osPlatform === constants.OS_WINDOWS ? 'where' : 'which';
      const path: string[] = await this.run(`"${cmd}" ${this.executableName}`);
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
  public async installationMeetsRequirements(path: string): Promise<boolean> {
    const version: string = await this.getVersion(path);
    if (semver.gte(version, this.getRequiredVersion())) {
      return true;
    }
    this.logger.info(
      `Found version ${version} of ${this.executableName} at ${path}, which does not meet the required version ${this.getRequiredVersion()}`,
    );
    return false;
  }

  /**
   * Check if the tool is installed globally and meets requirements
   */
  private async isInstalledGloballyAndMeetsRequirements(): Promise<boolean> {
    const path: false | string = await this.getGlobalExecutablePath();
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
      if (this.isInstalledLocally() && (await this.installationMeetsRequirements(this.localExecutablePath))) {
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
    return fs.existsSync(this.localExecutablePath);
  }

  /**
   * Uninstall the local version
   */
  public uninstallLocal(): void {
    if (this.isInstalledLocally()) {
      fs.rmSync(this.localExecutablePath);
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

    // If it is installed globally and meets requirements, copy it to the local path
    if (await this.isInstalledGloballyAndMeetsRequirements()) {
      this.logger.debug(`${this.executableName} is installed at globally and meets version requirements.`);
      fs.cpSync(this.globalExecutablePath, this.localExecutablePath);
      this.logger.debug(`Copied ${this.executableName} executable to ${this.installationDirectory}`);
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
        const fileName: string = processedFile.split(/[\\/]/).pop();
        const localExecutable: string = PathEx.join(this.installationDirectory, fileName);
        fs.cpSync(processedFile, localExecutable);
        fs.chmodSync(localExecutable, 0o755);
      }
    } catch (error: Error | any) {
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
