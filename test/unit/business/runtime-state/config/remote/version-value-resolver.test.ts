// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {resolveVersionValue} from '../../../../../../src/business/runtime-state/config/remote/version-value-resolver.js';
import {type SemanticVersion} from '../../../../../../src/business/utils/semantic-version.js';

describe('resolveVersionValue', (): void => {
  it('should prefer argv value over configured and default values', (): void => {
    const version: SemanticVersion<string> = resolveVersionValue('v1.2.3', 'v9.9.9', 'v0.0.1');

    expect(version.toString()).to.equal('1.2.3');
  });

  it('should use configured value when argv value is missing', (): void => {
    const version: SemanticVersion<string> = resolveVersionValue(undefined, 'v2.3.4', 'v0.0.1');

    expect(version.toString()).to.equal('2.3.4');
  });

  it('should use default value when argv and configured values are missing', (): void => {
    const version: SemanticVersion<string> = resolveVersionValue(undefined, undefined, 'v3.4.5');

    expect(version.toString()).to.equal('3.4.5');
  });
});
