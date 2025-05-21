// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {ReflectAssist} from '../../../../src/business/utils/reflect-assist.js';
import {UnsupportedOperationError} from '../../../../src/business/errors/unsupported-operation-error.js';

describe('ReflectAssist', () => {
  describe('constructor', () => {
    it('should throw UnsupportedOperationError when instantiated', () => {
      expect(() => new (ReflectAssist as any)()).to.throw(UnsupportedOperationError);
    });
  });

  describe('isRefreshable', () => {
    it('should return true for objects with a refresh method', () => {
      const object: any = {refresh: (): void => {}};
      expect(ReflectAssist.isRefreshable(object)).to.be.true;
    });

    it('should return false for objects without a refresh method', () => {
      const object: any = {persist: (): void => {}};
      expect(ReflectAssist.isRefreshable(object)).to.be.false;
    });
  });

  describe('isPersistable', () => {
    it('should return true for objects with a persist method', () => {
      const object: any = {persist: (): void => {}};
      expect(ReflectAssist.isPersistable(object)).to.be.true;
    });

    it('should return false for objects without a persist method', () => {
      const object: any = {refresh: (): void => {}};
      expect(ReflectAssist.isPersistable(object)).to.be.false;
    });
  });

  describe('isObjectStorageBackend', () => {
    it('should return true for objects with a readObject method', () => {
      const object: any = {readObject: (): void => {}};
      expect(ReflectAssist.isObjectStorageBackend(object)).to.be.true;
    });

    it('should return false for objects without a readObject method', () => {
      const object: any = {persist: (): void => {}};
      expect(ReflectAssist.isObjectStorageBackend(object)).to.be.false;
    });
  });

  describe('coerce', (): void => {
    it('should parse valid JSON strings', (): void => {
      expect(ReflectAssist.coerce('{"key":"value"}')).to.deep.equal({key: 'value'});
    });

    it('should return the original string for invalid JSON', () => {
      expect(ReflectAssist.coerce('invalid')).to.equal('invalid');
    });
  });

  describe('merge', () => {
    it('should merge two objects', () => {
      const object1: any = {key1: 'value1', key2: 'value2'};
      const object2: any = {key2: 'newValue2', key3: 'value3'};
      expect(ReflectAssist.merge(object1, object2)).to.deep.equal({
        key1: 'value1',
        key2: 'newValue2',
        key3: 'value3',
      });
    });

    it('should return the second object if the first is null', () => {
      const object2: any = {key2: 'value2'};
      expect(ReflectAssist.merge(null, object2)).to.deep.equal(object2);
    });

    it('should return the first object if the second is null', () => {
      const object1: any = {key1: 'value1'};
      expect(ReflectAssist.merge(object1, null)).to.deep.equal(object1);
    });
  });
});
