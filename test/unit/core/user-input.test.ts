// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {UserInput} from '../../../src/core/user-input.js';

describe('UserInput.sanitize', (): void => {
  it('passes plain input through unchanged', (): void => {
    expect(UserInput.sanitize('normal value')).to.equal('normal value');
    expect(UserInput.sanitize('alpha-numeric_123.value')).to.equal('alpha-numeric_123.value');
  });

  it('strips null bytes', (): void => {
    const nullByte: string = String.fromCodePoint(0);
    expect(UserInput.sanitize(`safe${nullByte}value`)).to.equal('safevalue');
    expect(UserInput.sanitize(`${nullByte}${nullByte}`)).to.equal('');
  });

  it('strips POSIX path-traversal sequences', (): void => {
    expect(UserInput.sanitize('../etc/passwd')).to.equal('etc/passwd');
    expect(UserInput.sanitize('../../root')).to.equal('root');
    expect(UserInput.sanitize('a/../b')).to.equal('a/b');
  });

  it('strips Windows path-traversal sequences', (): void => {
    expect(UserInput.sanitize(String.raw`..\windows\system32`)).to.equal(String.raw`windows\system32`);
  });

  it('strips URL-encoded traversal sequences', (): void => {
    expect(UserInput.sanitize('%2e%2e%2fetc')).to.equal('etc');
    expect(UserInput.sanitize('..%2fetc')).to.equal('etc');
    expect(UserInput.sanitize('%2E%2E%2Fetc')).to.equal('etc');
  });

  it('strips a leading single-dot prefix', (): void => {
    expect(UserInput.sanitize('./relative')).to.equal('relative');
    expect(UserInput.sanitize(String.raw`.\relative`)).to.equal('relative');
  });

  it('resists overlap-regrow bypass: ....// must not survive as ../', (): void => {
    // A single-pass replace of `../` against `....//` would leave `../` because the regex
    // consumes positions 2-4, exposing a fresh `../` at positions 0,1,5. sanitize() must
    // iterate until stable so the bypass cannot succeed. CodeQL flagged this on PR #4004.
    expect(UserInput.sanitize('....//')).to.equal('');
    expect(UserInput.sanitize('a/....//etc')).to.equal('a/etc');
    expect(UserInput.sanitize(String.raw`....\\windows`)).to.equal('windows');
  });

  it('resists overlap-regrow bypass for URL-encoded variants', (): void => {
    expect(UserInput.sanitize('%2e%2e%2e%2e%2f%2f')).to.equal('');
    expect(UserInput.sanitize('a%2f%2e%2e%2e%2e%2f%2fetc')).to.equal('a%2fetc');
  });

  it('returns non-string input as-is', (): void => {
    // The method is permissive on type so it can be dropped in front of unsafe coercions
    // without crashing the caller. Real validation should happen at typed boundaries.
    expect(UserInput.sanitize(123 as unknown as string)).to.equal(123);
    expect(UserInput.sanitize(undefined as unknown as string)).to.equal(undefined);
  });
});

describe('UserInput.escapeShell', (): void => {
  it('passes plain input through unchanged', (): void => {
    expect(UserInput.escapeShell('hello')).to.equal('hello');
    expect(UserInput.escapeShell('safe-value.123')).to.equal('safe-value.123');
  });

  it('escapes shell metacharacters in double-quote context', (): void => {
    expect(UserInput.escapeShell('a"b')).to.equal(String.raw`a\"b`);
    expect(UserInput.escapeShell('a$b')).to.equal(String.raw`a\$b`);
    expect(UserInput.escapeShell('a`b`c')).to.equal('a\\`b\\`c');
    expect(UserInput.escapeShell('a!b')).to.equal(String.raw`a\!b`);
  });

  it('escapes backslashes first so it does not double-escape downstream', (): void => {
    expect(UserInput.escapeShell(String.raw`a\b`)).to.equal(String.raw`a\\b`);
  });
});

describe('UserInput.escapeHelmTemplate', (): void => {
  it('passes plain input through unchanged', (): void => {
    expect(UserInput.escapeHelmTemplate('hello')).to.equal('hello');
  });

  it('escapes `{` and `}` so Helm treats them as literals', (): void => {
    expect(UserInput.escapeHelmTemplate('{{.Values.foo}}')).to.equal(String.raw`\{\{.Values.foo\}\}`);
    expect(UserInput.escapeHelmTemplate('a{b}c')).to.equal(String.raw`a\{b\}c`);
  });
});

describe('UserInput.escapeRegex', (): void => {
  it('passes plain input through unchanged', (): void => {
    expect(UserInput.escapeRegex('hello')).to.equal('hello');
  });

  it('escapes every regex metacharacter', (): void => {
    expect(UserInput.escapeRegex('.')).to.equal(String.raw`\.`);
    expect(UserInput.escapeRegex(String.raw`a.b*c+d?e^f$g(h)i{j}k|l[m]n\o`)).to.equal(
      String.raw`a\.b\*c\+d\?e\^f\$g\(h\)i\{j\}k\|l\[m\]n\\o`,
    );
  });

  it('produces a string that matches the original literally when used in RegExp', (): void => {
    const dangerous: string = 'a.b*c[d]e';
    const pattern: RegExp = new RegExp(UserInput.escapeRegex(dangerous));
    expect(pattern.test(dangerous)).to.equal(true);
    expect(pattern.test('axbXcYdZe')).to.equal(false);
  });
});

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
