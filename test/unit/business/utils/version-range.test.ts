// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {VersionRange} from '../../../../src/business/utils/version-range.js';
import {Version} from '../../../../src/business/utils/version.js';
import {SemVer} from 'semver';

describe('VersionRange', (): void => {
  describe('constructor', (): void => {
    it('should create a valid VersionRange with numeric bounds', (): void => {
      const range: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      expect(range.begin.value).to.equal(1);
      expect(range.end.value).to.equal(5);
    });

    it('should create a valid VersionRange with SemVer bounds', (): void => {
      const begin: Version<SemVer> = new Version(new SemVer('1.0.0'));
      const end: Version<SemVer> = new Version(new SemVer('2.0.0'));
      const range: VersionRange<SemVer> = new VersionRange(begin, end);
      expect(range.begin.value).to.equal(begin.value);
      expect(range.end.value).to.equal(end.value);
    });

    it('should throw a RangeError if begin is greater than or equal to end', () => {
      expect(() => new VersionRange(new Version(5), new Version(1))).to.throw(RangeError, 'Invalid version range');
      expect(() => new VersionRange(new Version(5), new Version(5))).to.throw(RangeError, 'Invalid version range');
    });
  });

  describe('fromIntegerBounds', (): void => {
    it('should create a VersionRange from integer bounds', (): void => {
      const range: VersionRange<number> = VersionRange.fromIntegerBounds(1, 5);
      expect(range.begin.value).to.equal(1);
      expect(range.end.value).to.equal(5);
    });

    it('should throw a RangeError for invalid bounds', (): void => {
      expect((): VersionRange<number> => VersionRange.fromIntegerBounds(5, 1)).to.throw(
        RangeError,
        'Invalid version range',
      );
    });
  });

  describe('fromIntegerVersion', (): void => {
    it('should create a VersionRange for a single integer version', (): void => {
      const range: VersionRange<number> = VersionRange.fromIntegerVersion(3);
      expect(range.begin.value).to.equal(3);
      expect(range.end.value).to.equal(4);
    });
  });

  describe('fromSemVerBounds', (): void => {
    it('should create a VersionRange from SemVer bounds', (): void => {
      const begin: SemVer = new SemVer('1.0.0');
      const end: SemVer = new SemVer('2.0.0');
      const range: VersionRange<SemVer> = VersionRange.fromSemVerBounds(begin, end);
      expect(range.begin.value).to.equal(begin);
      expect(range.end.value).to.equal(end);
    });

    it('should throw a RangeError for invalid SemVer bounds', (): void => {
      const begin: SemVer = new SemVer('2.0.0');
      const end: SemVer = new SemVer('1.0.0');
      expect(() => VersionRange.fromSemVerBounds(begin, end)).to.throw(RangeError, 'Invalid version range');
    });
  });

  describe('patchVersionBounds', (): void => {
    it('should create a VersionRange for all patch releases of a SemVer', (): void => {
      const version: SemVer = new SemVer('1.0.0');
      const range: VersionRange<SemVer> = VersionRange.patchVersionBounds(version);
      expect(range.begin.value).to.equal(version);
      expect(range.end.value.version).to.equal('1.1.0');
    });
  });

  describe('minorVersionBounds', (): void => {
    it('should create a VersionRange for all minor and patch releases of a SemVer', (): void => {
      const version: SemVer = new SemVer('1.0.0');
      const range: VersionRange<SemVer> = VersionRange.minorVersionBounds(version);
      expect(range.begin.value).to.equal(version);
      expect(range.end.value.version).to.equal('2.0.0');
    });
  });

  describe('equals', (): void => {
    it('should return true for equal VersionRanges', (): void => {
      const range1: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      const range2: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      expect(range1.equals(range2)).to.be.true;
    });

    it('should return false for different VersionRanges', (): void => {
      const range1: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      const range2: VersionRange<number> = new VersionRange(new Version(2), new Version(6));
      expect(range1.equals(range2)).to.be.false;
    });
  });

  describe('compare', (): void => {
    it('should return 0 for equal VersionRanges', (): void => {
      const range1: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      const range2: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      expect(range1.compare(range2)).to.equal(0);
    });

    it('should return -1 when the first range is less than the second', (): void => {
      const range1: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      const range2: VersionRange<number> = new VersionRange(new Version(2), new Version(6));
      expect(range1.compare(range2)).to.equal(-1);
    });

    it('should return 1 when the first range is greater than the second', (): void => {
      const range1: VersionRange<number> = new VersionRange(new Version(2), new Version(6));
      const range2: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      expect(range1.compare(range2)).to.equal(1);
    });
  });

  describe('contains', (): void => {
    it('should return true if a version is within the range', (): void => {
      const range: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      const version: Version<number> = new Version(3);
      expect(range.contains(version)).to.be.true;
    });

    it('should return false if a version is outside the range', (): void => {
      const range: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      const version: Version<number> = new Version(6);
      expect(range.contains(version)).to.be.false;
    });
  });

  describe('toString', (): void => {
    it('should return the string representation of the range', (): void => {
      const range: VersionRange<number> = new VersionRange(new Version(1), new Version(5));
      expect(range.toString()).to.equal('[1, 5)');
    });
  });
});
