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
import * as helpers from '../helpers.js';

const CURL_RELEASE_BASE_URL: string = 'https://curl.se/download';
const CURL_WINDOWS_BASE_URL: string = 'https://curl.se/windows';
const CURL_ARTIFACT_TEMPLATE: string = 'curl-%s-%s-%s.tar.gz';

@injectable()
export class CurlDependencyManager extends BaseDependencyManager {
  public constructor(
    @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
    @inject(InjectTokens.CurlInstallationDir) protected override readonly installationDirectory: string,
    @inject(InjectTokens.OsPlatform) osPlatform: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.CurlVersion) protected readonly curlVersion: string,
    @inject(InjectTokens.Zippy) private readonly zippy: Zippy,
  ) {
    installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.CurlInstallationDir,
      CurlDependencyManager.name,
    );
    osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, CurlDependencyManager.name);
    osArch = patchInject(osArch, InjectTokens.OsArch, CurlDependencyManager.name);
    curlVersion = patchInject(curlVersion, InjectTokens.CurlVersion, CurlDependencyManager.name);
    downloader = patchInject(downloader, InjectTokens.PackageDownloader, CurlDependencyManager.name);

    super(
      downloader,
      installationDirectory,
      osPlatform,
      osArch,
      curlVersion || version.CURL_VERSION,
      constants.CURL,
      CURL_RELEASE_BASE_URL,
    );

    this.zippy = patchInject(zippy, InjectTokens.Zippy, CurlDependencyManager.name);
  }

  private getWindowsVersionWithBuild(): string {
    return `${this.getRequiredVersion()}_7`;
  }

  protected getArtifactName(): string {
    if (this.osPlatform === constants.OS_WINDOWS) {
      const windowsVersionWithBuild: string = this.getWindowsVersionWithBuild();
      return `curl-${windowsVersionWithBuild}-win64-mingw.zip`;
    }

    return util.format(CURL_ARTIFACT_TEMPLATE, this.getRequiredVersion(), this.osPlatform, this.osArch);
  }

  protected getDownloadURL(): string {
    if (this.osPlatform === constants.OS_WINDOWS) {
      const windowsVersionWithBuild: string = this.getWindowsVersionWithBuild();
      const dlDirectory: string = `dl-${windowsVersionWithBuild}`;
      return `${CURL_WINDOWS_BASE_URL}/${dlDirectory}/${this.getArtifactName()}`;
    }

    return `${this.downloadBaseUrl}/${this.getArtifactName()}`;
  }

  protected getChecksumURL(): string {
    if (this.osPlatform === constants.OS_WINDOWS) {
      const windowsVersionWithBuild: string = this.getWindowsVersionWithBuild();
      const dlDirectory: string = `dl-${windowsVersionWithBuild}`;
      return `${CURL_WINDOWS_BASE_URL}/${dlDirectory}/${this.getArtifactName()}.sha256`;
    }

    return `${this.downloadBaseUrl}/${this.getArtifactName()}.sha256`;
  }

  public override getVerifyChecksum(): boolean {
    if (this.osPlatform === constants.OS_WINDOWS) {
      return false;
    }
    return super.getVerifyChecksum();
  }

  public async getVersion(executablePath: string): Promise<string> {
    try {
      const output: string[] = await this.run(`${executablePath} --version`);
      const match: RegExpMatchArray | null = output[0]?.match(/curl\s+(\d+\.\d+\.\d+)/i);
      if (match) {
        return match[1];
      }
    } catch (error) {
      throw new SoloError(`Failed to check curl version for ${executablePath}`, error);
    }
    throw new SoloError(`Unable to parse curl version for ${executablePath}`);
  }

  public override async install(temporaryDirectory: string = helpers.getTemporaryDirectory()): Promise<boolean> {
    if (this.osPlatform === constants.OS_WINDOWS) {
      return super.install(temporaryDirectory);
    }

    if (!(await this.shouldInstall())) {
      return true;
    }

    await this.preInstall();

    if (await this.isInstalledLocallyAndMeetsRequirementsForCurl()) {
      return true;
    }

    if (await this.isInstalledGloballyAndMeetsRequirementsForCurl()) {
      if (!fs.existsSync(this.installationDirectory)) {
        fs.mkdirSync(this.installationDirectory, {recursive: true});
      }

      this.uninstallLocal();
      fs.cpSync(this.globalExecutablePath, this.localExecutablePath);
      fs.chmodSync(this.localExecutablePath, 0o755);

      return this.isInstalledLocally();
    }

    throw new SoloError(
      `${this.executableName} could not be installed automatically on ${this.osPlatform}. ` +
        `Please install curl >= ${this.getRequiredVersion()} using your system package manager.`,
    );
  }

  private async isInstalledLocallyAndMeetsRequirementsForCurl(): Promise<boolean> {
    return this.isInstalledLocally() && (await this.installationMeetsRequirements(this.localExecutablePath));
  }

  private async getGlobalExecutablePathForCurl(): Promise<false | string> {
    try {
      if (this.globalExecutablePath) {
        return this.globalExecutablePath;
      }

      const cmd: string = this.osPlatform === constants.OS_WINDOWS ? 'where' : 'which';
      const pathResult: string[] = await this.run(`${cmd} ${this.executableName}`);
      if (pathResult.length === 0) {
        return false;
      }

      this.globalExecutablePath = pathResult[0];
      return pathResult[0];
    } catch {
      return false;
    }
  }

  private async isInstalledGloballyAndMeetsRequirementsForCurl(): Promise<boolean> {
    const path: false | string = await this.getGlobalExecutablePathForCurl();
    return Boolean(path && (await this.installationMeetsRequirements(path)));
  }

  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    const extractDirectory: string = path.join(temporaryDirectory, 'curl-extracted');
    fs.mkdirSync(extractDirectory, {recursive: true});

    if (this.osPlatform === constants.OS_WINDOWS) {
      this.zippy.unzip(packageFilePath, extractDirectory);

      // Find curl.exe in extracted folders
      const found: string[] = [];
      const searchDirectory = (directory: string): void => {
        const entries: fs.Dirent[] = fs.readdirSync(directory, {withFileTypes: true});
        for (const entry of entries) {
          const full: string = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            searchDirectory(full);
          } else if (entry.name.toLowerCase() === 'curl.exe') {
            found.push(full);
          }
        }
      };
      searchDirectory(extractDirectory);

      if (found.length === 0) {
        throw new SoloError(`Unable to locate curl.exe in extracted archive ${packageFilePath}`);
      }

      return [found[0]];
    }

    await this.run(`tar -xzf ${packageFilePath} -C ${extractDirectory}`);
    const binDirectory: string = path.join(extractDirectory, `curl-${this.getRequiredVersion()}`, 'src');
    const curlBinary: string = path.join(binDirectory, 'curl');

    return [curlBinary];
  }
}
