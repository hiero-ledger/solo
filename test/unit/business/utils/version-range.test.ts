// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {VersionRange} from '../../../../src/business/utils/version-range.js';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';

describe('VersionRange', (): void => {
  describe('constructor', (): void => {
    it('should create a valid VersionRange with numeric bounds', (): void => {
      const range: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      expect(range.begin.major).to.equal(1);
      expect(range.end.major).to.equal(5);
    });

    it('should create a valid VersionRange with SemanticVersion<string> bounds', (): void => {
      const begin: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const end: SemanticVersion<string> = new SemanticVersion('2.0.0');
      const range: VersionRange<string> = new VersionRange(begin, end);
      expect(range.begin.major).to.equal(begin.major);
      expect(range.end.major).to.equal(end.major);
    });

    it('should throw a RangeError if begin is greater than or equal to end', () => {
      expect(() => new VersionRange(new SemanticVersion(5), new SemanticVersion(1))).to.throw(
        RangeError,
        'Invalid version range',
      );
      expect(() => new VersionRange(new SemanticVersion(5), new SemanticVersion(5))).to.throw(
        RangeError,
        'Invalid version range',
      );
    });
  });

  describe('fromIntegerBounds', (): void => {
    it('should create a VersionRange from integer bounds', (): void => {
      const range: VersionRange<number> = VersionRange.fromIntegerBounds(1, 5);
      expect(range.begin.major).to.equal(1);
      expect(range.end.major).to.equal(5);
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
      expect(range.begin.major).to.equal(3);
      expect(range.end.major).to.equal(4);
    });
  });

  describe('fromSemanticVersion<string>Bounds', (): void => {
    it('should create a VersionRange from SemanticVersion<string> bounds', (): void => {
      const begin: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const end: SemanticVersion<string> = new SemanticVersion('2.0.0');
      const range: VersionRange<string> = VersionRange.fromSemanticVersionBounds(begin, end);
      expect(range.begin.major).to.equal(begin);
      expect(range.end.major).to.equal(end);
    });

    it('should throw a RangeError for invalid SemanticVersion<string> bounds', (): void => {
      const begin: SemanticVersion<string> = new SemanticVersion('2.0.0');
      const end: SemanticVersion<string> = new SemanticVersion('1.0.0');
      expect(() => VersionRange.fromSemanticVersionBounds(begin, end)).to.throw(RangeError, 'Invalid version range');
    });
  });

  describe('patchVersionBounds', (): void => {
    it('should create a VersionRange for all patch releases of a SemanticVersion<string>', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const range: VersionRange<string> = VersionRange.patchVersionBounds(version);
      expect(range.begin.major).to.equal(version);
      expect(range.end.toString()).to.equal('1.1.0');
    });
  });

  describe('minorVersionBounds', (): void => {
    it('should create a VersionRange for all minor and patch releases of a SemanticVersion<string>', (): void => {
      const version: SemanticVersion<string> = new SemanticVersion('1.0.0');
      const range: VersionRange<string> = VersionRange.minorVersionBounds(version);
      expect(range.begin.major).to.equal(version);
      expect(range.end.toString()).to.equal('2.0.0');
    });
  });

  describe('equals', (): void => {
    it('should return true for equal VersionRanges', (): void => {
      const range1: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      const range2: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      expect(range1.equals(range2)).to.be.true;
    });

    it('should return false for different VersionRanges', (): void => {
      const range1: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      const range2: VersionRange<number> = new VersionRange(new SemanticVersion(2), new SemanticVersion(6));
      expect(range1.equals(range2)).to.be.false;
    });
  });

  describe('compare', (): void => {
    it('should return 0 for equal VersionRanges', (): void => {
      const range1: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      const range2: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      expect(range1.compare(range2)).to.equal(0);
    });

    it('should return -1 when the first range is less than the second', (): void => {
      const range1: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      const range2: VersionRange<number> = new VersionRange(new SemanticVersion(2), new SemanticVersion(6));
      expect(range1.compare(range2)).to.equal(-1);
    });

    it('should return 1 when the first range is greater than the second', (): void => {
      const range1: VersionRange<number> = new VersionRange(new SemanticVersion(2), new SemanticVersion(6));
      const range2: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      expect(range1.compare(range2)).to.equal(1);
    });
  });

  describe('contains', (): void => {
    it('should return true if a version is within the range', (): void => {
      const range: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      const version: SemanticVersion<number> = new SemanticVersion(3);
      expect(range.contains(version)).to.be.true;
    });

    it('should return false if a version is outside the range', (): void => {
      const range: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      const version: SemanticVersion<number> = new SemanticVersion(6);
      expect(range.contains(version)).to.be.false;
    });
  });

  describe('toString', (): void => {
    it('should return the string representation of the range', (): void => {
      const range: VersionRange<number> = new VersionRange(new SemanticVersion(1), new SemanticVersion(5));
      expect(range.toString()).to.equal('[1, 5)');
    });
  });
});
