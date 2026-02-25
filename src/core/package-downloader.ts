// SPDX-License-Identifier: Apache-2.0

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import {pipeline as streamPipeline} from 'node:stream/promises';
import got from 'got';
import path from 'node:path';
import {DataValidationError} from './errors/data-validation-error.js';
import {SoloError} from './errors/solo-error.js';
import {IllegalArgumentError} from './errors/illegal-argument-error.js';
import {MissingArgumentError} from './errors/missing-argument-error.js';
import {ResourceNotFoundError} from './errors/resource-not-found-error.js';
import * as https from 'node:https';
import * as http from 'node:http';
import {Templates} from './templates.js';
import * as constants from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {ReadStream} from 'node:fs';
import {Hash} from 'node:crypto';
import {ClientRequest} from 'node:http';

@injectable()
export class PackageDownloader {
  public constructor(@inject(InjectTokens.SoloLogger) public readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  private isValidURL(url: string): boolean {
    try {
      // attempt to parse to check URL format
      const out: URL = new URL(url);
      return out.href !== undefined;
    } catch {
      return false;
    }
  }

  public urlExists(url: string): Promise<boolean> {
    return new Promise<boolean>((resolve): void => {
      try {
        this.logger.debug(`Checking URL: ${url}`);
        // attempt to send a HEAD request to check URL exists

        const request: ClientRequest = url.startsWith('http://')
          ? http.request(url, {method: 'HEAD', timeout: 100, headers: {Connection: 'close'}})
          : https.request(url, {method: 'HEAD', timeout: 100, headers: {Connection: 'close'}});

        request.on('response', (r): void => {
          const statusCode: number = r.statusCode;
          this.logger.debug({
            response: {
              // @ts-ignore
              connectOptions: r['connect-options'],
              statusCode: r.statusCode,
              headers: r.headers,
            },
          });
          request.destroy();
          if ([StatusCodes.OK, StatusCodes.MOVED_TEMPORARILY, StatusCodes.MOVED_PERMANENTLY].includes(statusCode)) {
            resolve(true);
          }

          resolve(false);
        });

        request.on('error', error => {
          this.logger.error(error);
          resolve(false);
          request.destroy();
        });

        request.end(); // make the request
      } catch (error) {
        this.logger.error(error);
        resolve(false);
      }
    });
  }

  /**
   * Fetch data from a URL and save the output to a file
   *
   * @param url - source file URL
   * @param destinationPath - destination path for the downloaded file
   */
  public async fetchFile(url: string, destinationPath: string): Promise<string> {
    if (!url) {
      throw new IllegalArgumentError('package URL is required', url);
    }

    if (!destinationPath) {
      throw new IllegalArgumentError('destination path is required', destinationPath);
    }

    if (!this.isValidURL(url)) {
      throw new IllegalArgumentError(`package URL '${url}' is invalid`, url);
    }

    if (!(await this.urlExists(url))) {
      throw new ResourceNotFoundError(`package URL '${url}' does not exist`, url);
    }

    try {
      await streamPipeline(got.stream(url, {followRedirect: true}), fs.createWriteStream(destinationPath));

      return destinationPath;
    } catch (error) {
      throw new SoloError(`Error fetching file ${url}: ${error.message}`, error);
    }
  }

  /**
   * Compute hash of the file contents
   * @param filePath - path of the file
   * @param [algo] - hash algorithm
   * @returns hex digest of the computed hash
   * @throws {Error} - if the file cannot be read
   */
  private computeFileHash(this: PackageDownloader, filePath: string, algo: string = 'sha384'): Promise<string> {
    return new Promise<string>((resolve, reject): void => {
      try {
        this.logger.debug(`Computing checksum for '${filePath}' using algo '${algo}'`);
        const checksum: Hash = crypto.createHash(algo);
        const s: ReadStream = fs.createReadStream(filePath);
        s.on('data', (d): void => {
          checksum.update(d as crypto.BinaryLike);
        });
        s.on('end', (): void => {
          const d: string = checksum.digest('hex');
          this.logger.debug(`Computed checksum '${d}' for '${filePath}' using algo '${algo}'`);
          resolve(d);
        });

        s.on('error', (error): void => {
          reject(error);
        });
      } catch (error) {
        reject(new SoloError('failed to compute checksum', error, {filePath, algo}));
      }
    });
  }

  /**
   * Verifies that the checksum of the sourceFile matches with the contents of the checksumFile
   *
   * It throws error if the checksum doesn't match.
   *
   * @param sourceFile - path to the file for which checksum to be computed
   * @param checksum - expected checksum
   * @param [algo] - hash algorithm to be used to compute checksum
   * @returns
   * @throws {DataValidationError} - if the checksum doesn't match
   */
  private async verifyChecksum(sourceFile: string, checksum: string, algo: string = 'sha256'): Promise<void> {
    const computed: string = await this.computeFileHash(sourceFile, algo);
    if (checksum !== computed) {
      throw new DataValidationError('checksum', checksum, computed);
    }
  }

  /**
   * Fetch a remote package
   * @param packageURL
   * @param checksumDataOrURL - package checksum URL or checksum data
   * @param destinationDirectory - a directory where the files should be downloaded to
   * @param verifyChecksum - whether to verify checksum or not
   * @param [algo] - checksum algo
   * @param [force] - force download even if the file exists in the destinationDirectory
   */
  public async fetchPackage(
    packageURL: string,
    checksumDataOrURL: string,
    destinationDirectory: string,
    verifyChecksum: boolean = true,
    algo: string = 'sha256',
    force: boolean = false,
  ): Promise<string> {
    if (!packageURL) {
      throw new Error('package URL is required');
    }
    if (!checksumDataOrURL) {
      throw new Error('checksum data or URL is required');
    }
    if (!destinationDirectory) {
      throw new Error('destination directory path is required');
    }

    this.logger.debug(`Downloading package: ${packageURL}, checksum: ${checksumDataOrURL}`);
    if (!fs.existsSync(destinationDirectory)) {
      fs.mkdirSync(destinationDirectory, {recursive: true});
    }

    const packageFile: string = `${destinationDirectory}/${path.basename(packageURL)}`;

    let checksumFile: string;
    try {
      if (fs.existsSync(packageFile) && !force) {
        return packageFile;
      }

      let checksum: string;
      if (verifyChecksum) {
        if (this.isValidURL(checksumDataOrURL)) {
          const checksumURL: string = checksumDataOrURL;
          checksumFile = `${destinationDirectory}/${path.basename(checksumURL)}`;
          await this.fetchFile(checksumURL, checksumFile);
          // Then read its contents
          const checksumData: string = fs.readFileSync(checksumFile).toString();
          if (!checksumData) {
            throw new SoloError(`unable to read checksum file: ${checksumFile}`);
          }
          checksum = checksumData.split(' ')[0];
        } else {
          checksum = checksumDataOrURL;
        }
      }

      await this.fetchFile(packageURL, packageFile);

      if (verifyChecksum) {
        await this.verifyChecksum(packageFile, checksum, algo);
      }
      return packageFile;
    } catch (error) {
      if (checksumFile && fs.existsSync(checksumFile)) {
        fs.rmSync(checksumFile);
      }

      if (fs.existsSync(packageFile)) {
        fs.rmSync(packageFile);
      }

      throw new SoloError(error.message, error);
    }
  }

  /**
   * Fetch Hedera platform release artifact
   *
   * It fetches the build.zip file containing the release from a URL like: https://builds.hedera.com/node/software/v0.40/build-v0.40.4.zip
   *
   * @param tag - full semantic version e.g. v0.40.4
   * @param destinationDirectory - directory where the artifact needs to be saved
   * @param [force] - whether to download even if the file exists
   * @returns full path to the downloaded file
   */
  public async fetchPlatform(tag: string, destinationDirectory: string, force: boolean = false): Promise<string> {
    if (!tag) {
      throw new MissingArgumentError('tag is required');
    }
    if (!destinationDirectory) {
      throw new MissingArgumentError('destination directory path is required');
    }

    const releaseDirectory: string = Templates.prepareReleasePrefix(tag);
    const downloadDirectory: string = `${destinationDirectory}/${releaseDirectory}`;
    const packageURL: string = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDirectory}/build-${tag}.zip`;
    const checksumURL: string = `${constants.HEDERA_BUILDS_URL}/node/software/${releaseDirectory}/build-${tag}.sha384`;

    return await this.fetchPackage(packageURL, checksumURL, downloadDirectory, true, 'sha384', force);
  }
}
