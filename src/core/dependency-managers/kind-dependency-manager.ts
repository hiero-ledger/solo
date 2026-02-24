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
import fs from 'node:fs';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import {PathEx} from '../../business/utils/path-ex.js';

const KIND_RELEASE_BASE_URL: string = 'https://kind.sigs.k8s.io/dl';
const KIND_ARTIFACT_TEMPLATE: string = '%s/kind-%s-%s';

@injectable()
export class KindDependencyManager extends BaseDependencyManager {
  public constructor(
    @inject(InjectTokens.PackageDownloader) protected override readonly downloader: PackageDownloader,
    @inject(InjectTokens.KindInstallationDir) protected override readonly installationDirectory: string,
    @inject(InjectTokens.OsArch) osArch: string,
    @inject(InjectTokens.KindVersion) protected readonly kindVersion: string,
  ) {
    // Patch injected values to handle undefined values
    installationDirectory = patchInject(
      installationDirectory,
      InjectTokens.KindInstallationDir,
      KindDependencyManager.name,
    );
    osArch = patchInject(osArch, InjectTokens.OsArch, KindDependencyManager.name);
    kindVersion = patchInject(kindVersion, InjectTokens.KindVersion, KindDependencyManager.name);
    downloader = patchInject(downloader, InjectTokens.PackageDownloader, KindDependencyManager.name);

    // Call the base constructor with the Kind-specific parameters
    super(
      downloader,
      installationDirectory,
      osArch,
      kindVersion || version.KIND_VERSION,
      constants.KIND,
      KIND_RELEASE_BASE_URL,
    );
  }

  /**
   * Get the Kind artifact name based on version, OS, and architecture
   */
  protected getArtifactName(): string {
    return util.format(
      KIND_ARTIFACT_TEMPLATE,
      this.getRequiredVersion(),
      OperatingSystem.getFormattedPlatform(),
      this.osArch,
    );
  }

  public async getVersion(executablePath: string): Promise<string> {
    // The retry logic is to handle potential transient issues with the command execution
    // The command `kind --version` was sometimes observed to return an empty output in the CI environment
    const maxAttempts: number = 3;
    for (let attempt: number = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output: string[] = await this.run(`"${executablePath}" --version`);
        this.logger.debug(`Attempt ${attempt}: Output from '${executablePath} --version': ${output.join('\n')}`);
        if (output.length > 0) {
          const match: RegExpMatchArray | null = output[0].trim().match(/(\d+\.\d+\.\d+)/);
          this.logger.debug(
            `Attempt ${attempt}: Extracted version from output: ${match ? match[1] : 'No match found'}`,
          );
          if (match && match[1]) {
            return match[1];
          }
        }
      } catch (error: any) {
        throw new SoloError(`Failed to check kind version for input ${executablePath}`, error);
      }
    }
    throw new SoloError(
      'Failed to check kind version - no output received after multiple attempts for ' + executablePath,
    );
  }

  protected getDownloadURL(): string {
    return `${this.downloadBaseUrl}/${this.artifactName}`;
  }

  /**
   * Handle any post-download processing before copying to destination
   * Child classes can override this for custom extraction or processing
   */
  protected async processDownloadedPackage(packageFilePath: string, temporaryDirectory: string): Promise<string[]> {
    // Default implementation - just return the downloaded file path
    // Child classes can override for extraction or other processing
    const kindExecutablePath: string = PathEx.join(temporaryDirectory, this.executableName);
    fs.renameSync(packageFilePath, kindExecutablePath);
    return [kindExecutablePath];
  }

  protected getChecksumURL(): string {
    return `${this.downloadURL}.sha256sum`;
  }
}
