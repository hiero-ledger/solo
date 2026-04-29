// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {ImageReference, type ParsedImageReference} from '../../../../src/business/utils/image-reference.js';

describe('ImageReference', (): void => {
  describe('validateImageTag', (): void => {
    it('should accept valid tags', (): void => {
      expect(ImageReference.validateImageTag('latest', 'latest')).to.equal('latest');
      expect(ImageReference.validateImageTag('0.77.0-SNAPSHOT', '0.77.0-SNAPSHOT')).to.equal('0.77.0-SNAPSHOT');
    });

    it('should reject invalid tags', (): void => {
      expect((): void => {
        ImageReference.validateImageTag('', '');
      }).to.throw('Invalid image tag');
      expect((): void => {
        ImageReference.validateImageTag('bad/tag', 'bad/tag');
      }).to.throw('Invalid image tag');
    });
  });

  describe('parseImageReference', (): void => {
    it('should parse explicit registry with implicit tag', (): void => {
      const parsed: ParsedImageReference = ImageReference.parseImageReference('docker.io/library/v400.0');
      expect(parsed.registry).to.equal('docker.io');
      expect(parsed.repository).to.equal('library/v400.0');
      expect(parsed.tag).to.equal('latest');
    });

    it('should parse docker hub shorthand', (): void => {
      const parsed: ParsedImageReference = ImageReference.parseImageReference('redis:7');
      expect(parsed.registry).to.equal('docker.io');
      expect(parsed.repository).to.equal('library/redis');
      expect(parsed.tag).to.equal('7');
    });

    it('should parse registry with port', (): void => {
      const parsed: ParsedImageReference = ImageReference.parseImageReference('localhost:5000/org/relay:v1');
      expect(parsed.registry).to.equal('localhost:5000');
      expect(parsed.repository).to.equal('org/relay');
      expect(parsed.tag).to.equal('v1');
    });

    it('should reject digest references', (): void => {
      expect((): void => {
        ImageReference.parseImageReference('ghcr.io/org/relay@sha256:123');
      }).to.throw('Digest-based image references are not supported');
    });

    it('should reject plain image values without separators', (): void => {
      expect((): void => {
        ImageReference.parseImageReference('latest');
      }).to.throw('Invalid image reference format');
    });
  });
});
