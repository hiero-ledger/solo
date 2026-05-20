// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import * as crypto from 'node:crypto';
import * as x509 from '@peculiar/x509';

import {BlockNodeRsaBootstrapRoster} from '../../../src/core/block-node-rsa-bootstrap-roster.js';

describe('BlockNodeRsaBootstrapRoster', (): void => {
  describe('buildBlockNodeRsaBootstrapRosterJson()', (): void => {
    it('builds roster JSON sorted by node id', (): void => {
      // @ts-expect-error - to access private method
      const rosterJson: string = BlockNodeRsaBootstrapRoster.buildBlockNodeRsaBootstrapRosterJson([
        {nodeId: 5, RSAPubKey: 'bb'},
        {nodeId: 4, RSAPubKey: 'aa'},
      ]);

      expect(JSON.parse(rosterJson)).to.deep.equal({
        nodeAddress: [
          {nodeId: 4, RSAPubKey: 'aa'},
          {nodeId: 5, RSAPubKey: 'bb'},
        ],
      });
    });
  });

  describe('extractRsaPublicKeyHexFromPemCertificate()', (): void => {
    it('extracts the hex-encoded DER SPKI public key from a PEM certificate', async (): Promise<void> => {
      const keyPair: CryptoKeyPair = (await crypto.webcrypto.subtle.generateKey(
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-384',
          modulusLength: 3072,
          publicExponent: new Uint8Array([1, 0, 1]),
        },
        true,
        ['sign', 'verify'],
      )) as CryptoKeyPair;

      const certificate: x509.X509Certificate = await x509.X509CertificateGenerator.createSelfSigned({
        name: 'CN=node1',
        keys: keyPair,
        signingAlgorithm: {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384'},
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 86_400_000),
      });

      const expectedPublicKeyDer: ArrayBuffer = await crypto.webcrypto.subtle.exportKey('spki', keyPair.publicKey);
      const expectedPublicKeyHex: string = Buffer.from(expectedPublicKeyDer).toString('hex');

      expect(
        // @ts-expect-error - to access private method
        BlockNodeRsaBootstrapRoster.extractRsaPublicKeyHexFromPemCertificate(certificate.toString('pem')),
      ).to.equal(expectedPublicKeyHex);
    });
  });
});
