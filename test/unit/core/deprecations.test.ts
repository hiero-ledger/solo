// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {Deprecations} from '../../../src/core/deprecations.js';
import {type Deprecation} from '../../../src/types/deprecation.js';

describe('Deprecations', (): void => {
  describe('computeRemoveBy', (): void => {
    it('advances the minor version by the default window of 6', (): void => {
      expect(Deprecations.computeRemoveBy('0.84.0')).to.equal('0.90.0');
    });

    it('advances the minor version by an explicit window', (): void => {
      expect(Deprecations.computeRemoveBy('0.84.0', 5)).to.equal('0.89.0');
    });

    it('resets the patch version and drops pre-release metadata', (): void => {
      expect(Deprecations.computeRemoveBy('1.2.3-alpha', 1)).to.equal('1.3.0');
    });
  });

  describe('resolveRemoveBy', (): void => {
    it('uses the explicit removeBy when provided', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181, removeBy: '1.0.0'};
      expect(Deprecations.resolveRemoveBy(deprecation)).to.equal('1.0.0');
    });

    it('computes the removeBy from since when not provided', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181};
      expect(Deprecations.resolveRemoveBy(deprecation)).to.equal('0.90.0');
    });
  });

  describe('formatDeprecationMessage', (): void => {
    it('includes the feature, versions, replacement, and tracking issue', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181, replacement: '--relay-version'};
      const message: string = Deprecations.formatDeprecationMessage('--relay-release', deprecation);
      expect(message).to.contain("'--relay-release' is deprecated since v0.84.0 and will be removed in v0.90.0.");
      expect(message).to.contain("Use '--relay-version' instead.");
      expect(message).to.contain('(tracking issue: #5181)');
    });

    it('omits the replacement clause when no replacement is given', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181};
      const message: string = Deprecations.formatDeprecationMessage('--relay-release', deprecation);
      expect(message).to.not.contain('Use ');
      expect(message).to.contain('(tracking issue: #5181)');
    });
  });

  describe('formatHelpMarker', (): void => {
    it('renders a compact marker with version window, replacement, and issue', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181, replacement: '--relay-version'};
      expect(Deprecations.formatHelpMarker(deprecation)).to.equal(
        'since v0.84.0, removal v0.90.0, use --relay-version',
      );
    });
  });
});
