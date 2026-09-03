// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {UserInput} from '../../../src/core/user-input.js';

describe('UserInput.safeJsonKey', (): void => {
  it('accepts normal keys', (): void => {
    expect(UserInput.safeJsonKey('foo')).to.equal(true);
    expect(UserInput.safeJsonKey('camelCase')).to.equal(true);
    expect(UserInput.safeJsonKey('snake_case')).to.equal(true);
    expect(UserInput.safeJsonKey('')).to.equal(true);
  });

  it('rejects prototype-pollution keys', (): void => {
    expect(UserInput.safeJsonKey('__proto__')).to.equal(false);
    expect(UserInput.safeJsonKey('constructor')).to.equal(false);
    expect(UserInput.safeJsonKey('prototype')).to.equal(false);
    expect(UserInput.safeJsonKey('__defineGetter__')).to.equal(false);
    expect(UserInput.safeJsonKey('__defineSetter__')).to.equal(false);
    expect(UserInput.safeJsonKey('__lookupGetter__')).to.equal(false);
    expect(UserInput.safeJsonKey('__lookupSetter__')).to.equal(false);
  });

  it('rejects non-string keys', (): void => {
    expect(UserInput.safeJsonKey(undefined as unknown as string)).to.equal(false);
    expect(UserInput.safeJsonKey(0 as unknown as string)).to.equal(false);
  });
});

describe('UserInput.stripUnsafeJsonKeys', (): void => {
  it('drops prototype-pollution keys at every depth', (): void => {
    const parsed: Record<string, unknown> = JSON.parse(
      '{"a":1,"__proto__":{"polluted":true},"nested":{"constructor":9,"b":2}}',
    );
    const cleaned: Record<string, unknown> = UserInput.stripUnsafeJsonKeys(parsed);
    expect(cleaned).to.deep.equal({a: 1, nested: {b: 2}});
    expect(Object.prototype.hasOwnProperty.call(cleaned, '__proto__')).to.equal(false);
  });

  it('filters object keys inside arrays', (): void => {
    const value: unknown[] = [{constructor: 1, keep: 2}, 'plain', 3];
    expect(UserInput.stripUnsafeJsonKeys(value)).to.deep.equal([{keep: 2}, 'plain', 3]);
  });

  it('passes primitives through unchanged', (): void => {
    expect(UserInput.stripUnsafeJsonKeys('x')).to.equal('x');
    expect(UserInput.stripUnsafeJsonKeys(42)).to.equal(42);
  });
});

describe('UserInput.safeFilenameComponent', (): void => {
  it('passes safe filename components through unchanged', (): void => {
    expect(UserInput.safeFilenameComponent('foo.bar')).to.equal('foo.bar');
    expect(UserInput.safeFilenameComponent('one-shot_123')).to.equal('one-shot_123');
  });

  it('replaces filesystem-unsafe characters with underscores', (): void => {
    expect(UserInput.safeFilenameComponent(String.raw`a/b\c:d*e?f"g<h>i|j`)).to.equal('a_b_c_d_e_f_g_h_i_j');
    expect(UserInput.safeFilenameComponent('with spaces')).to.equal('with_spaces');
  });
});
