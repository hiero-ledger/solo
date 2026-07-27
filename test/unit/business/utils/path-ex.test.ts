// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import {SoloError} from '../../../../src/core/errors/solo-error.js';

describe('PathEx', (): void => {
  const baseDirectory: string = path.normalize(path.resolve('/base/dir'));
  const validPath: string = PathEx.join(baseDirectory, 'file.txt');
  const validPathNormalized: string = path.normalize(path.resolve(validPath));
  const invalidPath: string = path.normalize(path.resolve('/outside/dir/file.txt'));

  beforeEach((): void => {
    sinon.stub(fs, 'realpathSync').callsFake((inputPath: string): string => {
      // Always normalize the input path for consistent comparison
      const normalizedInput: string = path.normalize(path.resolve(inputPath));
      const normalizedBaseDirectory: string = path.normalize(path.resolve(baseDirectory));
      const normalizedInvalidPath: string = path.normalize(path.resolve(invalidPath));

      if (normalizedInput === normalizedBaseDirectory || normalizedInput.includes(normalizedBaseDirectory + path.sep)) {
        return normalizedInput; // Return normalized path instead of original inputPath
      }

      if (normalizedInput === normalizedInvalidPath) {
        return normalizedInput;
      }

      throw new Error('Path does not exist');
    });
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('joinWithRealPath', (): void => {
    it('should join paths and return the real path', (): void => {
      const result: string = PathEx.joinWithRealPath(baseDirectory, 'file.txt');
      expect(path.normalize(result)).to.equal(validPathNormalized);
    });

    it('should throw an error if the path does not exist', (): void => {
      expect((): string => PathEx.joinWithRealPath('/nonexistent', 'file.txt')).to.throw('Path does not exist');
    });
  });

  describe('safeJoinWithBaseDirConfinement', (): void => {
    it('should securely join paths within the base directory', (): void => {
      const result: string = PathEx.safeJoinWithBaseDirConfinement(baseDirectory, 'file.txt');
      expect(path.normalize(result)).to.equal(validPathNormalized);
    });

    it('should throw SoloError for path traversal outside the base directory', (): void => {
      const outsideDirectoryPath: string = ['..', '..', 'outside', 'dir', 'file.txt'].join(path.sep);
      expect((): string => PathEx.safeJoinWithBaseDirConfinement(baseDirectory, outsideDirectoryPath)).to.throw(
        SoloError,
      );
    });
  });

  describe('realPathSync', (): void => {
    it('should return the real path for an existing path', (): void => {
      const result: string = PathEx.realPathSync(validPath);
      expect(path.normalize(result)).to.equal(validPathNormalized);
    });

    it('should throw an error for a non-existent path', (): void => {
      expect((): string => PathEx.realPathSync('/nonexistent')).to.throw('Path does not exist');
    });
  });

  describe('join', (): void => {
    it('should join paths and normalize the result', (): void => {
      const result: string = PathEx.join('/base', 'dir', 'file.txt');
      expect(result).to.equal(path.normalize('/base/dir/file.txt'));
    });
  });

  describe('resolve', (): void => {
    it('should resolve paths to an absolute path', (): void => {
      const result: string = PathEx.resolve('/base', 'dir', 'file.txt');
      expect(result).to.equal(path.resolve('/base', 'dir', 'file.txt'));
    });
  });
});
