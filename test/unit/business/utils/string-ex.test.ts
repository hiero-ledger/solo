// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {StringEx} from '../../../../src/business/utils/string-ex.js';
import {UnsupportedOperationError} from '../../../../src/business/errors/unsupported-operation-error.js';

describe('StringEx', () => {
  describe('constructor', () => {
    it('should throw UnsupportedOperationError when instantiated', () => {
      expect(() => new (StringEx as any)()).to.throw(UnsupportedOperationError);
    });
  });

  describe('isUppercase', () => {
    it('should return true for uppercase strings', () => {
      expect(StringEx.isUppercase('HELLO')).to.be.true;
    });

    it('should return false for lowercase strings', () => {
      expect(StringEx.isUppercase('hello')).to.be.false;
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty strings', () => {
      expect(StringEx.isEmpty('')).to.be.true;
    });

    it('should return false for non-empty strings', () => {
      expect(StringEx.isEmpty('hello')).to.be.false;
    });
  });

  describe('isUnderscored', () => {
    it('should return true for strings containing underscores', () => {
      expect(StringEx.isUnderscored('hello_world')).to.be.true;
    });

    it('should return false for strings without underscores', () => {
      expect(StringEx.isUnderscored('hello-world')).to.be.false;
    });
  });

  describe('isDashed', () => {
    it('should return true for strings containing dashes', () => {
      expect(StringEx.isDashed('hello-world')).to.be.true;
    });

    it('should return false for strings without dashes', () => {
      expect(StringEx.isDashed('hello_world')).to.be.false;
    });
  });

  describe('nounCase', () => {
    it('should capitalize the first letter of a string', () => {
      expect(StringEx.nounCase('hello')).to.equal('Hello');
    });

    it('should return an empty string if the input is empty', () => {
      expect(StringEx.nounCase('')).to.equal('');
    });
  });

  describe('verbCase', () => {
    it('should lowercase the first letter of a string', () => {
      expect(StringEx.verbCase('Hello')).to.equal('hello');
    });

    it('should return an empty string if the input is empty', () => {
      expect(StringEx.verbCase('')).to.equal('');
    });
  });

  describe('kebabToCamelCase', () => {
    it('should convert kebab-case to camelCase', () => {
      expect(StringEx.kebabToCamelCase('hello-world')).to.equal('helloWorld');
    });

    it('should return the original string if it is not kebab-case', () => {
      expect(StringEx.kebabToCamelCase('hello')).to.equal('hello');
    });
  });

  describe('snakeToCamelCase', () => {
    it('should convert snake_case to camelCase', () => {
      expect(StringEx.snakeToCamelCase('hello_world')).to.equal('helloWorld');
    });

    it('should return the original string if it is not snake_case', () => {
      expect(StringEx.snakeToCamelCase('hello')).to.equal('hello');
    });
  });

  describe('snakeToDotCase', () => {
    it('should convert snake_case to dot.case', () => {
      expect(StringEx.snakeToDotCase('hello_world')).to.equal('hello.world');
    });

    it('should return the original string if it is not snake_case', () => {
      expect(StringEx.snakeToDotCase('hello')).to.equal('hello');
    });
  });

  describe('camelCaseToKebab', () => {
    it('should convert camelCase to kebab-case', () => {
      expect(StringEx.camelCaseToKebab('helloWorld')).to.equal('hello-world');
    });

    it('should return the original string if it is not camelCase', () => {
      expect(StringEx.camelCaseToKebab('hello')).to.equal('hello');
    });
  });
});