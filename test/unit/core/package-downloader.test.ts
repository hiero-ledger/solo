// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {PackageDownloader} from '../../../src/core/package-downloader.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {IllegalArgumentError} from '../../../src/core/errors/illegal-argument-error.js';
import {MissingArgumentError} from '../../../src/core/errors/missing-argument-error.js';
import {ResourceNotFoundError} from '../../../src/core/errors/resource-not-found-error.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';

describe('PackageDownloader', (): void => {
  const testLogger: SoloPinoLogger = new SoloPinoLogger('debug', true);
  const downloader: PackageDownloader = new PackageDownloader(testLogger);

  describe('urlExists', (): void => {
    it('should return true if source URL is valid', async (): Promise<void> => {
      const url: string = 'https://builds.hedera.com/node/software/v0.42/build-v0.42.5.sha384';
      await expect(downloader.urlExists(url)).to.eventually.equal(true);
    });
    it('should return false if source URL is invalid', async (): Promise<void> => {
      const url: string = 'https://builds.hedera.com/node/software/v0.42/build-v0.42.5.INVALID';
      await expect(downloader.urlExists(url)).to.eventually.equal(false);
    });
  });

  describe('fetchFile', (): void => {
    it('should fail if source URL is missing', async (): Promise<void> => {
      await expect(downloader.fetchFile('', os.tmpdir())).to.be.rejectedWith('package URL is required');
    });

    it('should fail if destination path is missing', async (): Promise<void> => {
      await expect(downloader.fetchFile('https://localhost', '')).to.be.rejectedWith('destination path is required');
    });

    it('should fail with a malformed URL', async (): Promise<void> => {
      await expect(downloader.fetchFile('INVALID_URL', os.tmpdir())).to.be.rejectedWith(
        IllegalArgumentError,
        "package URL 'INVALID_URL' is invalid",
      );
    });

    it('should fail with an invalid URL', async (): Promise<void> => {
      await expect(downloader.fetchFile('https://localhost/INVALID_FILE', os.tmpdir())).to.be.rejectedWith(
        ResourceNotFoundError,
        "package URL 'https://localhost/INVALID_FILE' does not exist",
      );
    });

    it('should succeed with a valid release artifact URL', async (): Promise<void> => {
      // eslint-disable-next-line no-useless-catch
      try {
        const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));

        const tag: string = 'v0.42.5';
        const destinationPath: string = `${temporaryDirectory}/build-${tag}.sha384`;

        // we use the build-<tag>.sha384 file URL to test downloading a small file
        const url: string = `https://builds.hedera.com/node/software/v0.42/build-${tag}.sha384`;
        await expect(downloader.fetchFile(url, destinationPath)).to.eventually.equal(destinationPath);
        expect(fs.existsSync(destinationPath)).to.be.ok;

        // remove the file to reduce disk usage
        fs.rmSync(temporaryDirectory, {recursive: true});
      } catch (error) {
        throw error;
      }
    });
  });

  describe('fetchPlatform', (): void => {
    it('should fail if platform release tag is missing', async (): Promise<void> => {
      try {
        const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));
        await downloader.fetchPlatform('', temporaryDirectory);
        fs.rmSync(temporaryDirectory, {recursive: true});
        throw new Error('fetchPlatform should have thrown an error for missing platform release tag');
      } catch (error) {
        expect(error.cause).not.to.be.null;
        expect(error).to.be.instanceof(MissingArgumentError);
      }
    });
    it('should fail if platform release artifact is not found', async (): Promise<void> => {
      const tag: string = 'v0.40.0-INVALID';

      try {
        const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));
        await downloader.fetchPlatform(tag, temporaryDirectory);
        fs.rmSync(temporaryDirectory, {recursive: true});
        throw new Error('fetchPlatform should have thrown an error for invalid platform release artifact');
      } catch (error) {
        expect(error.cause).not.to.be.null;
        expect(error).to.be.instanceof(SoloError);
      }
    });

    it('should fail if platform release tag is invalid', async (): Promise<void> => {
      try {
        const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'downloader-'));
        await downloader.fetchPlatform('INVALID', os.tmpdir());
        fs.rmSync(temporaryDirectory, {recursive: true});
        throw new Error('fetchPlatform should have thrown an error for invalid platform release tag');
      } catch (error) {
        if (!error.message.includes('must include major, minor and patch fields')) {
          throw error;
        }
        expect(error.message).to.contain('must include major, minor and patch fields');
      }
    });

    it('should fail if destination directory is null', async (): Promise<void> => {
      try {
        await downloader.fetchPlatform('v0.40.0', '');
        throw new Error('fetchPlatform should have thrown an error for null destination directory');
      } catch (error) {
        expect(error.message).to.contain('destination directory path is required');
      }
    });
  });
});
