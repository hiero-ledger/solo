// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {IllegalArgumentError} from '../../../../src/core/errors/illegal-argument-error.js';

describe('SemanticVersion', () => {
  describe('constructor', () => {
    it('should create a SemanticVersion instance with a valid SemanticVersion<string>', () => {
      const semVersion: string = '1.0.0';
      const version: SemanticVersion<string> = new SemanticVersion(semVersion);
      expect(version.toString()).to.equal(semVersion);
    });

    it('should create a SemanticVersion instance with a valid numeric version', () => {
      const version: SemanticVersion<number> = new SemanticVersion(42);
      expect(version.major).to.equal(42);
    });

    it('should throw a RangeError for an invalid SemanticVersion<string>', () => {
      expect(() => new SemanticVersion(null as any)).to.throw(IllegalArgumentError, 'Invalid semantic version: null');
      expect(() => new SemanticVersion('invalid' as any)).to.throw(
        IllegalArgumentError,
        'Invalid semantic version: invalid',
      );
    });

    it('should throw a RangeError for an invalid numeric version', () => {
      expect(() => new SemanticVersion(-1)).to.throw(IllegalArgumentError, 'Invalid semantic version: -1');
    });
  });

  describe('equals', () => {
    it('should return true for equal SemanticVersion<string> versions', () => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return false for different SemanticVersion<string> versions', () => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('2.0.0');
      expect(version1.equals(version2)).to.be.false;
    });

    it('should return true for equal numeric versions', () => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(42);
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return false for different numeric versions', () => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(43);
      expect(version1.equals(version2)).to.be.false;
    });
  });

  describe('compare', () => {
    it('should return 0 for equal SemanticVersion<string> versions', () => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version1.compare(version2)).to.equal(0);
    });

    it('should return -1 when the first SemanticVersion<string> is less than the second', () => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('2.0.0');
      expect(version1.compare(version2)).to.equal(-1);
    });

    it('should return 1 when the first SemanticVersion<string> is greater than the second', () => {
      const version1: SemanticVersion<string> = new SemanticVersion('2.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version1.compare(version2)).to.equal(1);
    });

    it('should return 0 for equal numeric versions', () => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(42);
      expect(version1.compare(version2)).to.equal(0);
    });

    it('should return -1 when the first numeric version is less than the second', () => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(43);
      expect(version1.compare(version2)).to.equal(-1);
    });

    it('should return 1 when the first numeric version is greater than the second', () => {
      const version1: SemanticVersion<number> = new SemanticVersion(43);
      const version2: SemanticVersion<number> = new SemanticVersion(42);
      expect(version1.compare(version2)).to.equal(1);
    });
  });

  describe('toString', () => {
    it('should return the string representation of a SemanticVersion<string> version', () => {
      const version: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version.toString()).to.equal('1.0.0');
    });

    it('should return the string representation of a numeric version', () => {
      const version: SemanticVersion<number> = new SemanticVersion(42);
      expect(version.toString()).to.equal('42');
    });
  });
});
