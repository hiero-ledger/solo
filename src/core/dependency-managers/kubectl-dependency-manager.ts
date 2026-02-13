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

const KUBECTL_RELEASE_BASE_URL: string = 'https://dl.k8s.io/release';
const KUBECTL_ARTIFACT_TEMPLATE: string = '%s/bin/%s/%s/kubectl';
const KUBECTL_WINDOWS_ARTIFACT_TEMPLATE: string = '%s/bin/%s/%s/kubectl.exe';

@injectable()
export class KubectlDependencyManager extends BaseDependencyManager {
  public constructor(
    @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
    @inject(InjectTokens.KubectlInstallationDir) protected override readonly installationDirectory: string,
    @inject(InjectTokens.OsPlatform) osPlatform: NodeJS.Platform,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.KubectlVersion) protected readonly kubectlVersion: string,
  ) {
    // Patch injected values to handle undefined values
    installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.KubectlInstallationDir,
      KubectlDependencyManager.name,
    );
    osPlatform = patchInject(osPlatform, InjectTokens.OsPlatform, KubectlDependencyManager.name);
    osArch = patchInject(osArch, InjectTokens.OsArch, KubectlDependencyManager.name);
    kubectlVersion = patchInject(kubectlVersion, InjectTokens.KubectlVersion, KubectlDependencyManager.name);
    downloader = patchInject(downloader, InjectTokens.PackageDownloader, KubectlDependencyManager.name);

    // Call the base constructor with the Kubectl-specific parameters
    super(
      downloader,
      installationDirectory,
      osPlatform,
      osArch,
      kubectlVersion || version.KUBECTL_VERSION,
      constants.KUBECTL,
      KUBECTL_RELEASE_BASE_URL,
    );
  }

  /**
   * Get the Kubectl artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    return util.format(
      this.osPlatform === constants.OS_WINDOWS ? KUBECTL_WINDOWS_ARTIFACT_TEMPLATE : KUBECTL_ARTIFACT_TEMPLATE,
      this.getRequiredVersion(),
      this.osPlatform,
      this.osArch,
    );
  }

  public async getVersion(executablePath: string): Promise<string> {
    try {
      const output: string[] = await this.run(`${executablePath} version --client`);
      this.logger.info(`Raw kubectl version output: ${output.join('\n')}`);
      if (output.length > 0) {
        for (const line of output) {
          if (line.trim().startsWith('Client Version')) {
            const match: RegExpMatchArray | null = line.trim().match(/(\d+\.\d+\.\d+)/);
            if (match) {
              const detectedVersion: string = match[1];
              this.logger.info(`Kubectl version: ${detectedVersion}`);
              return detectedVersion;
            }
          }
        }
      }
    } catch (error: any) {
      throw new SoloError('Failed to check kubectl version', error);
    }
    throw new SoloError('Failed to get kubectl version');
  }

  protected getDownloadURL(): string {
    return `${this.downloadBaseUrl}/${this.artifactName}`;
  }

  /**
   * Handle any post-download processing before copying to destination
   * Child classes can override this for custom extraction or processing
   */
  protected async processDownloadedPackage(packageFilePath: string, _temporaryDirectory: string): Promise<string[]> {
    // Default implementation - just return the downloaded file path
    // Child classes can override for extraction or other processing
    return [packageFilePath];
  }

  protected getChecksumURL(): string {
    return `${this.downloadURL}.sha256`;
  }
}
