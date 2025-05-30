// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {Regex} from '../../../../src/business/utils/regex.js';
import {UnsupportedOperationError} from '../../../../src/business/errors/unsupported-operation-error.js';

describe('Regex', () => {
  describe('constructor', () => {
    it('should throw UnsupportedOperationError when instantiated', () => {
      expect(() => new (Regex as any)()).to.throw(UnsupportedOperationError);
    });
  });

  describe('escape', () => {
    it('should escape special regex characters', () => {
      const input = '.*+?^${}()|[]\\';
      const expected = '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\';
      expect(Regex.escape(input)).to.equal(expected);
    });

    it('should return the same string if no special characters are present', () => {
      const input = 'abc123';
      expect(Regex.escape(input)).to.equal(input);
    });

    it('should handle an empty string', () => {
      expect(Regex.escape('')).to.equal('');
    });

    it('should escape only special characters', () => {
      const input = 'abc?*1.2,3[';
      const expected = String.raw`abc\?\*1\.2,3\[`;
      expect(Regex.escape(input)).to.equal(expected);
    });
  });
});
