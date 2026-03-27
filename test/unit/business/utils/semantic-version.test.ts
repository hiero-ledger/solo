// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {IllegalArgumentError} from '../../../../src/core/errors/illegal-argument-error.js';

describe('SemanticVersion', (): void => {
  describe('constructor', (): void => {
    it('should create a SemanticVersion instance with a valid SemanticVersion<string>', (): void => {
      const semVersion: string = '1.0.0';
      const version: SemanticVersion<string> = new SemanticVersion(semVersion);
      expect(version.toString()).to.equal(semVersion);
    });

    it('should create a SemanticVersion instance with a valid numeric version', (): void => {
      const version: SemanticVersion<number> = new SemanticVersion(42);
      expect(version.major).to.equal(42);
    });

    it('should throw a RangeError for an invalid SemanticVersion<string>', (): void => {
      expect((): SemanticVersion<string | number> => new SemanticVersion(null as any)).to.throw(
        IllegalArgumentError,
        'Invalid semantic version: null',
      );
      expect((): SemanticVersion<string | number> => new SemanticVersion('invalid' as any)).to.throw(
        IllegalArgumentError,
        'Invalid semantic version: invalid',
      );
    });

    it('should throw a RangeError for an invalid numeric version', (): void => {
      expect((): SemanticVersion<-1> => new SemanticVersion(-1)).to.throw(
        IllegalArgumentError,
        'Invalid semantic version: -1',
      );
    });
  });

  describe('equals', (): void => {
    it('should return true for equal SemanticVersion<string> versions', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return false for different SemanticVersion<string> versions', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('2.0.0');
      expect(version1.equals(version2)).to.be.false;
    });

    it('should return true for equal numeric versions', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(42);
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return false for different numeric versions', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(43);
      expect(version1.equals(version2)).to.be.false;
    });
  });

  describe('compare', (): void => {
    it('should return 0 for equal SemanticVersion<string> versions', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version1.compare(version2)).to.equal(0);
      expect(version1.lessThan(version2)).to.be.false;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
      expect(version1.greaterThan(version2)).to.be.false;
      expect(version1.greaterThanOrEqual(version2)).to.be.true;
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return -1 when the first SemanticVersion<string> is less than the second', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('3.14.1');
      const version2: SemanticVersion<string> = new SemanticVersion('4.3.0');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('should return 1 when the first SemanticVersion<string> is greater than the second', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('2.0.0');
      const version2: SemanticVersion<string> = new SemanticVersion('1.2.3');
      expect(version1.compare(version2)).to.equal(1);
      expect(version1.greaterThan(version2)).to.be.true;
      expect(version1.greaterThanOrEqual(version2)).to.be.true;
    });

    it('should return 0 for equal numeric versions', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(42);
      expect(version1.compare(version2)).to.equal(0);
    });

    it('should return -1 when the first numeric version is less than the second', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(42);
      const version2: SemanticVersion<number> = new SemanticVersion(43);
      expect(version1.compare(version2)).to.equal(-1);
    });

    it('should return 1 when the first numeric version is greater than the second', (): void => {
      const version1: SemanticVersion<number> = new SemanticVersion(43);
      const version2: SemanticVersion<number> = new SemanticVersion(42);
      expect(version1.compare(version2)).to.equal(1);
      expect(version1.greaterThan(version2)).to.be.true;
      expect(version1.greaterThanOrEqual(version2)).to.be.true;
    });

    it('v3.14.2+gc309b6f is less than v4.1.3+gc94d381', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('3.14.2+gc309b6f');
      const version2: SemanticVersion<string> = new SemanticVersion('4.1.3+gc94d381');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('v0.0.1-alpha is less than v0.0.1', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('0.0.1-alpha');
      const version2: SemanticVersion<string> = new SemanticVersion('0.0.1');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('v1.0.0-beta.1 is less than v1.0.0-beta.2', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0-beta.1');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0-beta.2');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('v1.0.0-beta.2 is less than v1.0.0', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('1.0.0-beta.2');
      const version2: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('3.14.2+gc309b6f is less than 3.15.0', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('3.14.2+gc309b6f');
      const version2: SemanticVersion<string> = new SemanticVersion('3.15.0');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });

    it('3.14.2+gc309b6f is equal to 3.14.2', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('3.14.2+gc309b6f');
      const version2: SemanticVersion<string> = new SemanticVersion('3.14.2');
      expect(version1.compare(version2)).to.equal(0);
      expect(version1.equals(version2)).to.be.true;
    });

    it('0.28.1-rc.1 < 0.28.1', (): void => {
      const version1: SemanticVersion<string> = new SemanticVersion('0.28.1-rc.1');
      const version2: SemanticVersion<string> = new SemanticVersion('0.28.1');
      expect(version1.compare(version2)).to.equal(-1);
      expect(version1.lessThan(version2)).to.be.true;
      expect(version1.lessThanOrEqual(version2)).to.be.true;
    });
  });

  describe('toString', (): void => {
    it('should return the string representation of a SemanticVersion<string> version', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(version.toString()).to.equal('1.0.0');
    });

    it('should return the string representation of a numeric version', (): void => {
      const version: SemanticVersion<number> = new SemanticVersion(42);
      expect(version.toString()).to.equal('42');
    });

    it('should return the string representation of a single number string', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('42');
      expect(version.toString()).to.equal('42.0.0');
    });

    it('should return the string representation as v3.14.2+gc309b6f for a version with build metadata', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('3.14.2+gc309b6f');
      expect(version.toString()).to.equal('3.14.2+gc309b6f');
    });
  });
});
