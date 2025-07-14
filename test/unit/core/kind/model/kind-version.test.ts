// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {KindVersion} from '../../../../../src/integration/kind/model/kind-version.js';
import {SemVer} from 'semver';

describe('KindVersion', () => {
  describe('constructor', () => {
    it('should correctly parse valid version string', () => {
      const response = 'kind version v1.2.3';
      const kindVersion = new KindVersion(response);

      const version = kindVersion.getVersion();
      expect(version).to.be.instanceOf(SemVer);
      expect(version.major).to.equal(1);
      expect(version.minor).to.equal(2);
      expect(version.patch).to.equal(3);
    });

    it('should handle version string with extra information', () => {
      const response = 'kind version v1.2.3 (build abcdef)';
      const kindVersion = new KindVersion(response);

      const version = kindVersion.getVersion();
      expect(version).to.be.instanceOf(SemVer);
      expect(version.major).to.equal(1);
      expect(version.minor).to.equal(2);
      expect(version.patch).to.equal(3);
    });

    it('should throw an error for invalid version format', () => {
      const response = 'kind version invalid';
      expect(() => new KindVersion(response)).to.throw();
    });
  });

  describe('getVersion', () => {
    it('should return the parsed SemVer object', () => {
      const response = 'kind version v2.0.1';
      const kindVersion = new KindVersion(response);

      const version = kindVersion.getVersion();
      expect(version).to.be.instanceOf(SemVer);
      expect(version.toString()).to.equal('2.0.1');
    });
  });
});
