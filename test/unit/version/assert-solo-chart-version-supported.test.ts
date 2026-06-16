// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {assertSoloChartVersionSupported, MINIMUM_SOLO_CHART_VERSION} from '../../../version.js';
import {SoloErrors} from '../../../src/core/errors/solo-errors.js';
import {SemanticVersion} from '../../../src/business/utils/semantic-version.js';

describe('assertSoloChartVersionSupported', (): void => {
  it('is a no-op when MINIMUM_SOLO_CHART_VERSION is the empty string (scaffold phase)', (): void => {
    // Sanity-check the scaffold default: the gate must ship inactive so it cannot block users
    // before solo-charts publishes a release containing the security work for #4002.
    expect(MINIMUM_SOLO_CHART_VERSION).to.equal('');
    expect((): void => assertSoloChartVersionSupported('0.1.0')).to.not.throw();
    expect((): void => assertSoloChartVersionSupported(new SemanticVersion('0.1.0'))).to.not.throw();
  });

  it('passes when the version is exactly the minimum', (): void => {
    expect((): void => assertSoloChartVersionSupported('0.64.0', '0.64.0')).to.not.throw();
  });

  it('passes when the version is above the minimum', (): void => {
    expect((): void => assertSoloChartVersionSupported('0.64.1', '0.64.0')).to.not.throw();
    expect((): void => assertSoloChartVersionSupported('1.0.0', '0.64.0')).to.not.throw();
  });

  it('throws when the version is below the minimum', (): void => {
    expect((): void => assertSoloChartVersionSupported('0.63.3', '0.64.0')).to.throw(
      SoloErrors.validation.soloChartVersionTooLow,
    );
  });

  it('accepts both string and SemanticVersion inputs', (): void => {
    const stringInput: string = '0.63.3';
    const versionInput: SemanticVersion<string> = new SemanticVersion(stringInput);
    expect((): void => assertSoloChartVersionSupported(stringInput, '0.64.0')).to.throw(
      SoloErrors.validation.soloChartVersionTooLow,
    );
    expect((): void => assertSoloChartVersionSupported(versionInput, '0.64.0')).to.throw(
      SoloErrors.validation.soloChartVersionTooLow,
    );
  });

  it('error message includes both the actual and minimum versions for debuggability', (): void => {
    try {
      assertSoloChartVersionSupported('0.50.0', '0.64.0');
      expect.fail('expected to throw');
    } catch (error: unknown) {
      expect(error).to.be.instanceOf(SoloErrors.validation.soloChartVersionTooLow);
      const message: string = (error as Error).message;
      expect(message).to.include('0.50.0');
      expect(message).to.include('0.64.0');
    }
  });
});
