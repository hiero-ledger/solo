// SPDX-License-Identifier: Apache-2.0

import 'chai-as-promised';

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {SoloError} from '../../../src/core/errors/solo-error.js';
import {MissingArgumentError} from '../../../src/core/errors/classes/validation/missing-argument-error.js';
import {IllegalArgumentError} from '../../../src/core/errors/classes/validation/illegal-argument-error.js';
import os from 'node:os';
import fs from 'node:fs';
import {Zippy} from '../../../src/core/zippy.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';

describe('Zippy', (): void => {
  const testLogger: SoloPinoLogger = new SoloPinoLogger('debug', true);
  const zippy: Zippy = new Zippy(testLogger);

  describe('unzip', (): void => {
    it('should fail if source file is missing', (): void => {
      expect((): string => zippy.unzip('', '')).to.throw(MissingArgumentError);
    });

    it('should fail if destination file is missing', (): void => {
      expect((): string => zippy.unzip('test/data/test.zip', '')).to.throw(MissingArgumentError);
    });

    it('should fail if source file is invalid', (): void => {
      expect((): string => zippy.unzip('/INVALID', os.tmpdir())).to.throw(IllegalArgumentError);
    });

    it('should fail for a directory', (): void => {
      expect((): string => zippy.unzip('test/data', os.tmpdir())).to.throw(SoloError);
    });

    it('should fail for a non-zip file', (): void => {
      expect((): string => zippy.unzip('test/data/test.txt', os.tmpdir())).to.throw(SoloError);
    });

    it('should succeed for valid inputs', async (): Promise<void> => {
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      const zipFile: string = `${temporaryDirectory}/test.zip`;
      const unzippedFile: string = `${temporaryDirectory}/unzipped`;
      await expect(zippy.zip('test/data/.empty', zipFile)).to.eventually.equal(zipFile);
      expect(zippy.unzip(zipFile, unzippedFile, true)).to.equal(unzippedFile);
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    });
  });

  describe('untar', (): void => {
    it('should fail if source file is missing', (): void => {
      expect((): string => zippy.untar('', '')).to.throw(MissingArgumentError);
    });

    it('should fail if destination file is missing', (): void => {
      expect((): string => zippy.untar('test/data/test.tar', '')).to.throw(MissingArgumentError);
    });

    it('should fail if source file is invalid', (): void => {
      expect((): string => zippy.untar('/INVALID', os.tmpdir())).to.throw(IllegalArgumentError);
    });

    it('should fail for a directory', (): void => {
      expect((): string => zippy.untar('test/data', os.tmpdir())).to.throw(SoloError);
    });

    it('should fail for a non-tar file', (): void => {
      expect((): string => zippy.untar('test/data/test.txt', os.tmpdir())).to.throw(SoloError);
    });

    it('should succeed for valid inputs', (): void => {
      const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'installer-'));
      const tarFile: string = `${temporaryDirectory}/test.tar.gz`;
      expect(zippy.tar('test/data/.empty', tarFile)).to.equal(tarFile);
      expect(zippy.untar(tarFile, temporaryDirectory)).to.equal(temporaryDirectory);
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    });
  });
});
