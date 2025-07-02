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

// constants required by KindDependencyManager
const KIND_RELEASE_BASE_URL = 'https://kind.sigs.k8s.io/dl';
const KIND_ARTIFACT_TEMPLATE = '%s/kind-%s-%s';

const KIND_ARTIFACT_EXT: Map<string, string> = new Map()
  .set(constants.OS_DARWIN, 'tar.gz')
  .set(constants.OS_LINUX, 'tar.gz')
  .set(constants.OS_WINDOWS, 'zip');

/**
 * Kind dependency manager installs or uninstalls kind client at SOLO_HOME_DIR/bin directory
 */
@injectable()
export class KindDependencyManager extends ShellRunner {
  private readonly osPlatform: string;
  private readonly osArch: string;
  private kindPath: string;
  private readonly artifactName: string;
  private readonly kindURL: string;
  private readonly checksumURL: string;

  constructor(
    @inject(InjectTokens.PackageDownloader) private readonly downloader?: PackageDownloader,
    @inject(InjectTokens.Zippy) private readonly zippy?: Zippy,
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
    this.zippy = patchInject(zippy, InjectTokens.Zippy, this.constructor.name);
    this.installationDirectory = installationDirectory;
    // Node.js uses 'win32' for windows in package.json os field, but kind uses 'windows'
    this.osPlatform = osPlatform === OS_WIN32 ? OS_WINDOWS : osPlatform;
    this.osArch = ['x64', 'x86-64'].includes(osArch) ? 'amd64' : osArch;
    this.kindPath = Templates.installationPath(constants.KIND, this.osPlatform, this.installationDirectory);

    const fileExtension = KIND_ARTIFACT_EXT.get(this.osPlatform);
    this.artifactName = util.format(
      KIND_ARTIFACT_TEMPLATE,
      this.kindVersion,
      this.osPlatform,
      this.osArch,
    );
    this.kindURL = `${KIND_RELEASE_BASE_URL}/${this.artifactName}`;
    this.checksumURL = `${KIND_RELEASE_BASE_URL}/${this.artifactName}.sha256sum`;
  }

  getKindPath() {
    return this.kindPath;
  }

  isInstalled() {
    return fs.existsSync(this.kindPath);
  }

  /**
   * Uninstall kind from solo bin folder
   */
  uninstall() {
    if (this.isInstalled()) {
      fs.rmSync(this.kindPath);
    }
  }

  async install(temporaryDirectory: string = helpers.getTemporaryDirectory()) {
    const packageFile = await this.downloader.fetchPackage(this.kindURL, this.checksumURL, temporaryDirectory);

    if (!fs.existsSync(this.installationDirectory)) {
      fs.mkdirSync(this.installationDirectory);
    }

    // install new kind
    this.uninstall();
    this.kindPath = Templates.installationPath(constants.KIND, this.osPlatform, this.installationDirectory);
    fs.cpSync(packageFile, this.kindPath);

    let destinationPath: string;
    if (this.osPlatform === constants.OS_WINDOWS) {
      // append .exe for windows
      destinationPath = PathEx.join(temporaryDirectory, `${constants.KIND}.exe`);
    } else {
      destinationPath = PathEx.join(temporaryDirectory, constants.KIND);
    }

    try {
      fs.renameSync(packageFile, destinationPath);
      // fs.chmodSync(destinationPath, 0o777);
    } catch (error: Error | any) {
      this.logger.error(`Failed to rename kind binary: ${error.message}`);
      throw new Error(`Failed to install ${constants.KIND}: ${error.message}`);
    }

    if (!this.isInstalled()) {
      return false;
    }

    fs.chmodSync(this.kindPath, 0o755);
    return true;
  }

  async checkVersion(shouldInstall = true) {
    if (!this.isInstalled()) {
      if (shouldInstall) {
        await this.install();
      } else {
        return false;
      }
    }

    const output: string[] = await this.run(`${this.kindPath} --version`);
    if (output.length > 0) {
      const match = output[0].trim().match(/(\d+\.\d+\.\d+)/);
      const kindVersion = match ? match[1] : null;
      this.logger.debug(`Found ${constants.KIND}:${kindVersion}`);
      return semver.gte(kindVersion, version.KIND_VERSION);
    }
    return false;
  }

  getKindVersion() {
    return version.KIND_VERSION;
  }
}
