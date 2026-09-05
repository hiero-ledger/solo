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

  describe('deriveModuleParsedReference', (): void => {
    it('should append suffix to the repository', (): void => {
      const base: ParsedImageReference = {registry: 'docker.io', repository: 'library/hedera-mirror', tag: '0.156.0'};
      const derived: ParsedImageReference = ImageReference.deriveModuleParsedReference(base, 'importer');
      expect(derived.registry).to.equal('docker.io');
      expect(derived.repository).to.equal('library/hedera-mirror-importer');
      expect(derived.tag).to.equal('0.156.0');
    });

    it('should handle rest-java suffix correctly', (): void => {
      const base: ParsedImageReference = {registry: 'docker.io', repository: 'library/hedera-mirror', tag: '0.156.0'};
      const derived: ParsedImageReference = ImageReference.deriveModuleParsedReference(base, 'rest-java');
      expect(derived.repository).to.equal('library/hedera-mirror-rest-java');
    });

    it('should preserve custom registry', (): void => {
      const base: ParsedImageReference = {registry: 'ghcr.io', repository: 'hiero-ledger/hedera-mirror', tag: 'dev'};
      const derived: ParsedImageReference = ImageReference.deriveModuleParsedReference(base, 'grpc');
      expect(derived.registry).to.equal('ghcr.io');
      expect(derived.repository).to.equal('hiero-ledger/hedera-mirror-grpc');
      expect(derived.tag).to.equal('dev');
    });

    it('should not mutate the original reference', (): void => {
      const base: ParsedImageReference = {registry: 'docker.io', repository: 'library/hedera-mirror', tag: '0.156.0'};
      ImageReference.deriveModuleParsedReference(base, 'web3');
      expect(base.repository).to.equal('library/hedera-mirror');
    });
  });

  describe('deriveModuleImageReference', (): void => {
    it('should insert suffix before the tag', (): void => {
      const derived: string = ImageReference.deriveModuleImageReference('hedera-mirror:0.156.0', 'importer');
      expect(derived).to.equal('hedera-mirror-importer:0.156.0');
    });

    it('should handle rest-java suffix', (): void => {
      const derived: string = ImageReference.deriveModuleImageReference('hedera-mirror:0.156.0', 'rest-java');
      expect(derived).to.equal('hedera-mirror-rest-java:0.156.0');
    });

    it('should preserve registry/repository prefix', (): void => {
      const derived: string = ImageReference.deriveModuleImageReference(
        'myprefix/hedera-mirror:0.156.0-abc1234',
        'grpc',
      );
      expect(derived).to.equal('myprefix/hedera-mirror-grpc:0.156.0-abc1234');
    });

    it('should handle full registry references', (): void => {
      const derived: string = ImageReference.deriveModuleImageReference(
        'registry.example.com/project/hedera-mirror:0.156.0',
        'web3',
      );
      expect(derived).to.equal('registry.example.com/project/hedera-mirror-web3:0.156.0');
    });

    it('should handle reference without tag', (): void => {
      const derived: string = ImageReference.deriveModuleImageReference('hedera-mirror', 'monitor');
      expect(derived).to.equal('hedera-mirror-monitor');
    });
  });
});
