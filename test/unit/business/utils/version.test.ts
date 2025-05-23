// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {Version} from '../../../../src/business/utils/version.js';
import {SemVer} from 'semver';

describe('Version', () => {
  describe('constructor', () => {
    it('should create a Version instance with a valid SemVer', () => {
      const semVersion: SemVer = new SemVer('1.0.0');
      const version: Version<SemVer> = new Version(semVersion);
      expect(version.value).to.equal(semVersion);
    });

    it('should create a Version instance with a valid numeric version', () => {
      const version: Version<number> = new Version(42);
      expect(version.value).to.equal(42);
    });

    it('should throw a RangeError for an invalid SemVer', () => {
      expect(() => new Version(null as any)).to.throw(RangeError, 'Invalid version');
      expect(() => new Version('invalid' as any)).to.throw(RangeError, 'Invalid version');
    });

    it('should throw a RangeError for an invalid numeric version', () => {
      expect(() => new Version(-1)).to.throw(RangeError, 'Invalid version');
    });
  });

  describe('equals', () => {
    it('should return true for equal SemVer versions', () => {
      const version1: Version<SemVer> = new Version(new SemVer('1.0.0'));
      const version2: Version<SemVer> = new Version(new SemVer('1.0.0'));
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return false for different SemVer versions', () => {
      const version1: Version<SemVer> = new Version(new SemVer('1.0.0'));
      const version2: Version<SemVer> = new Version(new SemVer('2.0.0'));
      expect(version1.equals(version2)).to.be.false;
    });

    it('should return true for equal numeric versions', () => {
      const version1: Version<number> = new Version(42);
      const version2: Version<number> = new Version(42);
      expect(version1.equals(version2)).to.be.true;
    });

    it('should return false for different numeric versions', () => {
      const version1: Version<number> = new Version(42);
      const version2: Version<number> = new Version(43);
      expect(version1.equals(version2)).to.be.false;
    });
  });

  describe('compare', () => {
    it('should return 0 for equal SemVer versions', () => {
      const version1: Version<SemVer> = new Version(new SemVer('1.0.0'));
      const version2: Version<SemVer> = new Version(new SemVer('1.0.0'));
      expect(version1.compare(version2)).to.equal(0);
    });

    it('should return -1 when the first SemVer is less than the second', () => {
      const version1: Version<SemVer> = new Version(new SemVer('1.0.0'));
      const version2: Version<SemVer> = new Version(new SemVer('2.0.0'));
      expect(version1.compare(version2)).to.equal(-1);
    });

    it('should return 1 when the first SemVer is greater than the second', () => {
      const version1: Version<SemVer> = new Version(new SemVer('2.0.0'));
      const version2: Version<SemVer> = new Version(new SemVer('1.0.0'));
      expect(version1.compare(version2)).to.equal(1);
    });

    it('should return 0 for equal numeric versions', () => {
      const version1: Version<number> = new Version(42);
      const version2: Version<number> = new Version(42);
      expect(version1.compare(version2)).to.equal(0);
    });

    it('should return -1 when the first numeric version is less than the second', () => {
      const version1: Version<number> = new Version(42);
      const version2: Version<number> = new Version(43);
      expect(version1.compare(version2)).to.equal(-1);
    });

    it('should return 1 when the first numeric version is greater than the second', () => {
      const version1: Version<number> = new Version(43);
      const version2: Version<number> = new Version(42);
      expect(version1.compare(version2)).to.equal(1);
    });
  });

  describe('toString', () => {
    it('should return the string representation of a SemVer version', () => {
      const version: Version<SemVer> = new Version(new SemVer('1.0.0'));
      expect(version.toString()).to.equal('1.0.0');
    });

    it('should return the string representation of a numeric version', () => {
      const version: Version<number> = new Version(42);
      expect(version.toString()).to.equal('42');
    });
  });
});
