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

const CURL_RELEASE_BASE_URL: string = 'https://curl.se/download';
const CURL_ARTIFACT_TEMPLATE: string = 'curl-%s-%s-%s.tar.gz';

@injectable()
export class CurlDependencyManager extends BaseDependencyManager {
  public constructor(
    @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
    @inject(InjectTokens.CurlInstallationDir) protected override readonly installationDirectory: string,
    @inject(InjectTokens.OsPlatform) osPlatform: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.CurlVersion) protected readonly curlVersion: string,
  ) {
    // Patch injected values to handle undefined values
    installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.CurlInstallationDir,
      CurlDependencyManager.name,
    );
    osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, CurlDependencyManager.name);
    osArch = patchInject(osArch, InjectTokens.OsArch, CurlDependencyManager.name);
    curlVersion = patchInject(curlVersion, InjectTokens.CurlVersion, CurlDependencyManager.name);
    downloader = patchInject(downloader, InjectTokens.PackageDownloader, CurlDependencyManager.name);

    // Call the base constructor with the Kind-specific parameters
    super(
      downloader,
      installationDirectory,
      osPlatform,
      osArch,
      curlVersion || version.CURL_VERSION,
      constants.CURL,
      CURL_RELEASE_BASE_URL,
    );
  }

  /**
   * Get the Kind artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    return util.format(CURL_ARTIFACT_TEMPLATE, this.getRequiredVersion(), this.osPlatform, this.osArch);
  }

  protected getDownloadURL(): string {
    return `${this.downloadBaseUrl}/${this.artifactName}`;
  }

  protected getChecksumURL(): string {
    return `${this.downloadURL}.sha256`;
  }

  public async getVersion(executablePath: string): Promise<string> {
    try {
      const output: string[] = await this.run(`${executablePath} --version`);
      const match: RegExpMatchArray | null = output[0]?.match(/curl (\d+\.\d+\.\d+)/);
      if (match) {
        return match[1];
      }
    } catch (error) {
      throw new SoloError(`Failed to check curl version for ${executablePath}`, error);
    }
    throw new SoloError(`Unable to parse curl version for ${executablePath}`);
  }

  /**
   * Handle any post-download processing before copying to destination
   * Child classes can override this for custom extraction or processing
   */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    const extractDirectory: string = path.join(temporaryDirectory, 'curl-extracted');
    fs.mkdirSync(extractDirectory);

    await this.run(`tar -xzf ${packageFilePath} -C ${extractDirectory}`);

    const binDirectory: string = path.join(extractDirectory, `curl-${this.getRequiredVersion()}`, 'src');
    const curlBinary: string = path.join(binDirectory, 'curl');

    return [curlBinary];
  }
}
