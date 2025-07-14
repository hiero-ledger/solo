// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import * as util from 'node:util';
import {MissingArgumentError} from '../errors/missing-argument-error.js';
import * as helpers from '../helpers.js';
import * as constants from '../constants.js';
import {type PackageDownloader} from '../package-downloader.js';
import {Templates} from '../templates.js';
import * as version from '../../../version.js';
import {ShellRunner} from '../shell-runner.js';
import * as semver from 'semver';
import {OS_WIN32, OS_WINDOWS} from '../constants.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {PathEx} from '../../business/utils/path-ex.js';

const KIND_RELEASE_BASE_URL: string = 'https://kind.sigs.k8s.io/dl';
const KIND_ARTIFACT_TEMPLATE: string = '%s/kind-%s-%s';

@injectable()
export class KindDependencyManager extends ShellRunner {
  private readonly osPlatform: string;
  private readonly osArch: string;
  private localKindPath: string;
  private globalKindPath: string;
  private readonly artifactName: string;
  private readonly kindURL: string;
  private readonly checksumURL: string;
  private cachedGlobalExecutablePath: string;

  constructor(
    @inject(InjectTokens.PackageDownloader) private readonly downloader?: PackageDownloader,
    @inject(InjectTokens.KindInstallationDir) private readonly installationDirectory?: string,
    @inject(InjectTokens.OsPlatform) osPlatform?: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch?: string,
    @inject(InjectTokens.KindVersion) private readonly kindVersion?: string,
  ) {
    super();
    this.installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.KindInstallationDir,
      this.constructor.name,
    );
    this.osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, this.constructor.name);
    this.osArch = patchInject(osArch, InjectTokens.OsArch, this.constructor.name);
    this.kindVersion = patchInject(kindVersion, InjectTokens.KindVersion, this.constructor.name);

    if (!installationDirectory) {
      throw new MissingArgumentError('installation directory is required');
    }

    this.downloader = patchInject(downloader, InjectTokens.PackageDownloader, this.constructor.name);
    this.installationDirectory = installationDirectory;
    this.osPlatform = osPlatform === OS_WIN32 ? OS_WINDOWS : osPlatform;
    this.osArch = ['x64', 'x86-64'].includes(osArch as string) ? 'amd64' : (osArch as string);
    this.localKindPath = Templates.installationPath(constants.KIND, this.osPlatform, this.installationDirectory);

    this.artifactName = util.format(KIND_ARTIFACT_TEMPLATE, this.kindVersion, this.osPlatform, this.osArch);
    this.kindURL = `${KIND_RELEASE_BASE_URL}/${this.artifactName}`;
    this.checksumURL = `${KIND_RELEASE_BASE_URL}/${this.artifactName}.sha256sum`;
    this.globalKindPath = '';
    this.cachedGlobalExecutablePath = '';
  }

  public getKindPath(): string {
    return this.globalKindPath || this.localKindPath;
  }

  async getGlobalExecutablePath(): Promise<false | string> {
    try {
      if (this.cachedGlobalExecutablePath) {
        return this.cachedGlobalExecutablePath;
      }
      const cmd: string = this.osPlatform === constants.OS_WINDOWS ? 'where' : 'which';
      const path: string[] = await this.run(`${cmd} ${constants.KIND}`);
      if (path.length === 0) {
        return false;
      }
      this.cachedGlobalExecutablePath = path[0];
      return path[0];
    } catch {
      return false;
    }
  }

  async installationMeetsRequirements(path: string): Promise<boolean> {
    try {
      const output: string[] = await this.run(`${path} --version`);
      if (output.length > 0) {
        const match: RegExpMatchArray | null = output[0].trim().match(/(\d+\.\d+\.\d+)/);
        const kindVersion: string | null = match ? match[1] : undefined;
        return semver.gte(kindVersion as string, version.KIND_VERSION);
      }
    } catch (error: Error | any) {
      this.logger.error(`Failed to check global kind version: ${error.message}`);
    }
    return false;
  }

  async isInstalledGloballyAndMeetsRequirements(): Promise<boolean> {
    const path: false | string = await this.getGlobalExecutablePath();
    if (path && (await this.installationMeetsRequirements(path))) {
      this.globalKindPath = path;
      return true;
    }
    return false;
  }

  public isInstalledLocally(): boolean {
    return fs.existsSync(this.localKindPath);
  }

  public uninstallLocal(): void {
    if (this.isInstalledLocally()) {
      fs.rmSync(this.localKindPath);
    }
  }

  public async install(temporaryDirectory: string = helpers.getTemporaryDirectory()): Promise<boolean> {
    if (await this.isInstalledGloballyAndMeetsRequirements()) {
      return true;
    }

    const packageFile: string = await this.downloader!.fetchPackage(this.kindURL, this.checksumURL, temporaryDirectory);

    if (!fs.existsSync(this.installationDirectory!)) {
      fs.mkdirSync(this.installationDirectory!);
    }

    this.uninstallLocal();
    this.localKindPath = Templates.installationPath(constants.KIND, this.osPlatform, this.installationDirectory!);
    fs.cpSync(packageFile, this.localKindPath);

    let destinationPath: string;
    // eslint-disable-next-line prefer-const
    destinationPath =
      this.osPlatform === constants.OS_WINDOWS
        ? PathEx.join(temporaryDirectory, `${constants.KIND}.exe`)
        : PathEx.join(temporaryDirectory, constants.KIND);

    try {
      fs.renameSync(packageFile, destinationPath);
    } catch (error: Error | any) {
      this.logger.error(`Failed to rename kind binary: ${error.message}`);
      throw new Error(`Failed to install ${constants.KIND}: ${error.message}`);
    }

    if (!this.isInstalledLocally()) {
      return false;
    }

    fs.chmodSync(this.localKindPath, 0o755);
    return true;
  }

  public async checkVersion(shouldInstall: boolean = true): Promise<boolean> {
    if (await this.isInstalledGloballyAndMeetsRequirements()) {
      return true;
    }

    if (!this.isInstalledLocally()) {
      if (shouldInstall) {
        await this.install();
      } else {
        return false;
      }
    }

    return this.installationMeetsRequirements(this.localKindPath);
  }

  public getKindVersion(): string {
    return version.KIND_VERSION;
  }
}
