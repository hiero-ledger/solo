// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import fs from 'node:fs';
import path from 'node:path';
import sinon from 'sinon';
import {SoloError} from '../../../../src/core/errors/solo-error.js';

describe('PathEx', () => {
  const baseDirectory: string = path.normalize('/base/dir');
  const validPath: string = path.join(baseDirectory, 'file.txt');
  const validPathNormalized: string = path.normalize(validPath);
  const invalidPath: string = path.normalize('/outside/dir/file.txt');

  beforeEach(() => {
    sinon.stub(fs, 'realpathSync').callsFake((inputPath: string) => {
      // Always normalize the input path for consistent comparison
      const normalizedInput = path.normalize(inputPath);
      const normalizedBaseDirectory = path.normalize(baseDirectory);
      const normalizedInvalidPath = path.normalize(invalidPath);

      // For Windows compatibility, also check the result of resolving baseDirectory + file.txt
      const resolvedPath = path.normalize(path.resolve(normalizedBaseDirectory, 'file.txt'));

      if (
        normalizedInput === normalizedBaseDirectory ||
        normalizedInput.startsWith(normalizedBaseDirectory + path.sep) ||
        normalizedInput === resolvedPath
      ) {
        return normalizedInput; // Return normalized path instead of original inputPath
      }

      if (normalizedInput === normalizedInvalidPath) {
        return normalizedInput;
      }

      throw new Error('Path does not exist');
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('joinWithRealPath', () => {
    it('should join paths and return the real path', () => {
      const result = PathEx.joinWithRealPath(baseDirectory, 'file.txt');
      expect(path.normalize(result)).to.equal(validPathNormalized);
    });

    it('should throw an error if the path does not exist', () => {
      expect(() => PathEx.joinWithRealPath('/nonexistent', 'file.txt')).to.throw('Path does not exist');
    });
  });

  describe('safeJoinWithBaseDirConfinement', () => {
    it('should securely join paths within the base directory', () => {
      const result = PathEx.safeJoinWithBaseDirConfinement(baseDirectory, 'file.txt');
      expect(path.normalize(result)).to.equal(validPathNormalized);
    });

    it('should throw SoloError for path traversal outside the base directory', () => {
      const outsideDirectoryPath: string = ['..', '..', 'outside', 'dir', 'file.txt'].join(path.sep);
      expect(() => PathEx.safeJoinWithBaseDirConfinement(baseDirectory, outsideDirectoryPath)).to.throw(SoloError);
    });
  });

  describe('realPathSync', () => {
    it('should return the real path for an existing path', () => {
      const result = PathEx.realPathSync(validPath);
      expect(path.normalize(result)).to.equal(validPathNormalized);
    });

    it('should throw an error for a non-existent path', () => {
      expect(() => PathEx.realPathSync('/nonexistent')).to.throw('Path does not exist');
    });
  });

  describe('join', () => {
    it('should join paths and normalize the result', () => {
      const result = PathEx.join('/base', 'dir', 'file.txt');
      expect(result).to.equal(path.normalize('/base/dir/file.txt'));
    });
  });

  describe('resolve', () => {
    it('should resolve paths to an absolute path', () => {
      const result = PathEx.resolve('/base', 'dir', 'file.txt');
      expect(result).to.equal(path.resolve('/base', 'dir', 'file.txt'));
    });
  });
});