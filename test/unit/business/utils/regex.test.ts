// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {Regex} from '../../../../src/business/utils/regex.js';
import {UnsupportedOperationError} from '../../../../src/core/errors/classes/internal/unsupported-operation-error.js';

describe('Regex', (): void => {
  describe('constructor', (): void => {
    it('should throw UnsupportedOperationError when instantiated', (): void => {
      expect((): Regex => new (Regex as any)()).to.throw(UnsupportedOperationError);
    });
  });

  describe('escape', (): void => {
    it('should escape special regex characters', (): void => {
      const input: string = '.*+?^${}()|[]\\';
      const expected: string = '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\';
      expect(Regex.escape(input)).to.equal(expected);
    });

    it('should return the same string if no special characters are present', (): void => {
      const input: string = 'abc123';
      expect(Regex.escape(input)).to.equal(input);
    });

    it('should handle an empty string', (): void => {
      expect(Regex.escape('')).to.equal('');
    });

    it('should escape only special characters', (): void => {
      const input: string = 'abc?*1.2,3[';
      const expected: string = String.raw`abc\?\*1\.2,3\[`;
      expect(Regex.escape(input)).to.equal(expected);
    });
  });
});
