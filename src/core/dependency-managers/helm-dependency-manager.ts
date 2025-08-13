// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import * as util from 'node:util';
import {MissingArgumentError} from '../errors/missing-argument-error.js';
import * as helpers from '../helpers.js';
import * as constants from '../constants.js';
import {type PackageDownloader} from '../package-downloader.js';
import {type Zippy} from '../zippy.js';
import {Templates} from '../templates.js';
import * as version from '../../../version.js';
import {ShellRunner} from '../shell-runner.js';
import * as semver from 'semver';
import {OS_WIN32, OS_WINDOWS} from '../constants.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {PathEx} from '../../business/utils/path-ex.js';

// constants required by HelmDependencyManager
const HELM_RELEASE_BASE_URL = 'https://get.helm.sh';
const HELM_ARTIFACT_TEMPLATE = 'helm-%s-%s-%s.%s';

const HELM_ARTIFACT_EXT: Map<string, string> = new Map()
  .set(constants.OS_DARWIN, 'tar.gz')
  .set(constants.OS_LINUX, 'tar.gz')
  .set(constants.OS_WINDOWS, 'zip');

/**
 * Helm dependency manager installs or uninstalls helm client at SOLO_HOME_DIR/bin directory
 */
@injectable()
export class HelmDependencyManager extends ShellRunner {
  private readonly osPlatform: string;
  private readonly osArch: string;
  private localHelmPath: string;
  private globalHelmPath: string;
  private readonly artifactName: string;
  private readonly helmURL: string;
  private readonly checksumURL: string;
  private cachedGlobalExecutablePath: string;

  constructor(
    @inject(InjectTokens.PackageDownloader) private readonly downloader?: PackageDownloader,
    @inject(InjectTokens.Zippy) private readonly zippy?: Zippy,
    @inject(InjectTokens.HelmInstallationDir) private readonly installationDirectory?: string,
    @inject(InjectTokens.OsPlatform) osPlatform?: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch?: string,
    @inject(InjectTokens.HelmVersion) private readonly helmVersion?: string,
  ) {
    super();
    this.installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.HelmInstallationDir,
      this.constructor.name,
    );
    this.osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, this.constructor.name);
    this.osArch = patchInject(osArch, InjectTokens.OsArch, this.constructor.name);
    this.helmVersion = patchInject(helmVersion, InjectTokens.HelmVersion, this.constructor.name);

    if (!installationDirectory) {
      throw new MissingArgumentError('installation directory is required');
    }

    this.downloader = patchInject(downloader, InjectTokens.PackageDownloader, this.constructor.name);
    this.zippy = patchInject(zippy, InjectTokens.Zippy, this.constructor.name);
    this.installationDirectory = installationDirectory;
    // Node.js uses 'win32' for windows in package.json os field, but helm uses 'windows'
    this.osPlatform = osPlatform === OS_WIN32 ? OS_WINDOWS : osPlatform;
    this.osArch = ['x64', 'x86-64'].includes(osArch) ? 'amd64' : osArch;
    this.localHelmPath = Templates.installationPath(constants.HELM, this.osPlatform, this.installationDirectory);

    const fileExtension = HELM_ARTIFACT_EXT.get(this.osPlatform);
    this.artifactName = util.format(
      HELM_ARTIFACT_TEMPLATE,
      this.helmVersion,
      this.osPlatform,
      this.osArch,
      fileExtension,
    );
    this.helmURL = `${HELM_RELEASE_BASE_URL}/${this.artifactName}`;
    this.checksumURL = `${HELM_RELEASE_BASE_URL}/${this.artifactName}.sha256sum`;
  }

  getHelmPath() {
    return this.localHelmPath;
  }

  isInstalled() {
    return fs.existsSync(this.localHelmPath);
  }

  /**
   * Uninstall helm from solo bin folder
   */
  uninstall() {
    if (this.isInstalled()) {
      fs.rmSync(this.localHelmPath);
    }
  }

  async isInstalledGloballyAndMeetsRequirements(): Promise<boolean> {
    const path: false | string = await this.getGlobalExecutablePath();
    if (path && (await this.installationMeetsRequirements(path))) {
      this.globalHelmPath = path;
      return true;
    }
    return false;
  }

  async getGlobalExecutablePath(): Promise<false | string> {
    try {
      if (this.cachedGlobalExecutablePath) {
        return this.cachedGlobalExecutablePath;
      }
      const cmd: string = this.osPlatform === constants.OS_WINDOWS ? 'where' : 'which';
      const path: string[] = await this.run(`${cmd} ${constants.HELM}`);
      if (path.length === 0) {
        return false;
      }
      this.cachedGlobalExecutablePath = path[0];
      return path[0];
    } catch {
      return false;
    }
  }

  public async install(temporaryDirectory: string = helpers.getTemporaryDirectory()): Promise<boolean> {
    let helmSource: string;
    const extractedDirectory: string = PathEx.join(temporaryDirectory, 'extracted-helm');
    if (await this.isInstalledGloballyAndMeetsRequirements()) {
      // Copy global helm to local installation directory
      if (!fs.existsSync(this.installationDirectory)) {
        fs.mkdirSync(this.installationDirectory);
      }
      this.uninstall();
      this.localHelmPath = Templates.installationPath(constants.HELM, this.osPlatform, this.installationDirectory);
      fs.cpSync(this.globalHelmPath, this.localHelmPath);
      return this.isInstalled();
    }

    helmSource = PathEx.join(extractedDirectory, `${this.osPlatform}-${this.osArch}`, constants.HELM);

    const packageFile = await this.downloader.fetchPackage(this.helmURL, this.checksumURL, temporaryDirectory);
    if (this.osPlatform === constants.OS_WINDOWS) {
      this.zippy.unzip(packageFile, extractedDirectory);
      // append .exe for windows
      helmSource = PathEx.join(extractedDirectory, `${this.osPlatform}-${this.osArch}`, `${constants.HELM}.exe`);
    } else {
      this.zippy.untar(packageFile, extractedDirectory);
    }

    if (!fs.existsSync(this.installationDirectory)) {
      fs.mkdirSync(this.installationDirectory);
    }

    // install new helm
    this.uninstall();
    this.localHelmPath = Templates.installationPath(constants.HELM, this.osPlatform, this.installationDirectory);
    fs.cpSync(helmSource, this.localHelmPath);

    if (fs.existsSync(extractedDirectory)) {
      fs.rmSync(extractedDirectory, {recursive: true});
    }

    return this.isInstalled();
  }

  async installationMeetsRequirements(path: string): Promise<boolean> {
    try {
      const output: string[] = await this.run(`${path} version --short`);
      const parts: string[] = output[0].split('+');
      this.logger.debug(`Found ${constants.HELM}:${parts[0]}`);
      return semver.gte(parts[0], version.HELM_VERSION);
    } catch (error: Error | any) {
      this.logger.error(`Failed to check global helm version: ${error.message}`);
    }
    return false;
  }

  async checkVersion(shouldInstall = true) {
    if (!this.isInstalled()) {
      if (shouldInstall) {
        await this.install();
      } else {
        return false;
      }
    }

    return this.installationMeetsRequirements(this.localHelmPath);
  }

  getHelmVersion() {
    return version.HELM_VERSION;
  }
}
