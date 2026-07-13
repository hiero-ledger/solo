// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import fs from 'node:fs';
import os from 'node:os';
import sinon from 'sinon';
import {KeyManager} from '../../../src/core/key-manager.js';
import * as constants from '../../../src/core/constants.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {Duration} from '../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {type NodeKeyObject} from '../../../src/types/node-key-object.js';
import {type PrivateKeyAndCertificateObject} from '../../../src/types/private-key-and-certificate-object.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';

describe('KeyManager', (): void => {
  const keyManager: KeyManager = container.resolve(InjectTokens.KeyManager);

  it('should generate signing key', async (): Promise<void> => {
    const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'keys-'));
    const nodeAlias: NodeAlias = 'node1' as NodeAlias;
    const keyPrefix: string = constants.SIGNING_KEY_PREFIX;

    const signingKey: NodeKeyObject = await keyManager.generateSigningKey(nodeAlias);

    const nodeKeyFiles: PrivateKeyAndCertificateObject = keyManager.prepareNodeKeyFilePaths(
      nodeAlias,
      temporaryDirectory,
    );
    const files: PrivateKeyAndCertificateObject = await keyManager.storeNodeKey(
      nodeAlias,
      signingKey,
      temporaryDirectory,
      nodeKeyFiles,
      keyPrefix,
    );
    expect(files.privateKeyFile).not.to.be.null;
    expect(files.certificateFile).not.to.be.null;

    const nodeKey: NodeKeyObject = await keyManager.loadSigningKey(nodeAlias, temporaryDirectory);
    expect(nodeKey.certificate.rawData.toString()).to.equal(signingKey.certificate.rawData.toString());
    expect(nodeKey.privateKey.algorithm).to.deep.equal(signingKey.privateKey.algorithm);
    expect(nodeKey.privateKey.type).to.deep.equal(signingKey.privateKey.type);

    expect(
      await signingKey.certificate.verify({
        publicKey: signingKey.certificate.publicKey,
        signatureOnly: true,
      }),
    ).to.be.true;

    fs.rmSync(temporaryDirectory, {recursive: true});
  });

  it('should generate TLS key', async (): Promise<void> => {
    const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'keys-'));
    const nodeAlias: NodeAlias = 'node1';

    const tlsKey: NodeKeyObject = await keyManager.generateGrpcTlsKey(nodeAlias);
    expect(tlsKey.certificate.subject).not.to.equal('');
    expect(tlsKey.certificate.issuer).not.to.equal('');

    const files: PrivateKeyAndCertificateObject = await keyManager.storeTLSKey(nodeAlias, tlsKey, temporaryDirectory);
    expect(files.privateKeyFile).not.to.be.null;
    expect(files.certificateFile).not.to.be.null;

    const nodeKey: NodeKeyObject = await keyManager.loadTLSKey(nodeAlias, temporaryDirectory);
    expect(nodeKey.certificate.subject).to.deep.equal(tlsKey.certificate.subject);
    expect(nodeKey.certificate.issuer).to.deep.equal(tlsKey.certificate.issuer);
    expect(nodeKey.certificate.rawData.toString()).to.deep.equal(tlsKey.certificate.rawData.toString());
    expect(nodeKey.privateKey.algorithm).to.deep.equal(tlsKey.privateKey.algorithm);
    expect(nodeKey.privateKey.type).to.deep.equal(tlsKey.privateKey.type);

    expect(
      await tlsKey.certificate.verify({
        publicKey: tlsKey.certificate.publicKey,
        signatureOnly: true,
      }),
    ).to.be.true;

    fs.rmSync(temporaryDirectory, {recursive: true});
  }).timeout(Duration.ofSeconds(20).toMillis());

  it('createTlsSecret should remove the generated cert and key from disk after storing them in the secret', async (): Promise<void> => {
    const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'tls-'));
    const domainName: string = 'explorer.example.com';
    const namespace: NamespaceName = NamespaceName.of('solo-e2e');
    const certificatePath: string = PathEx.join(temporaryDirectory, `${domainName}.crt`);
    const keyPath: string = PathEx.join(temporaryDirectory, `${domainName}.key`);

    const k8FactoryStub: K8Factory = {
      default: sinon.stub().returns({
        secrets: sinon.stub().returns({
          createOrReplace: sinon.stub().resolves(true),
        }),
      }),
    } as unknown as K8Factory;

    await KeyManager.createTlsSecret(k8FactoryStub, namespace, domainName, temporaryDirectory, 'ca-secret-test');

    // The cert/key must be uploaded to the secret and then removed from the cache, leaving no private key behind.
    expect(fs.existsSync(certificatePath)).to.be.false;
    expect(fs.existsSync(keyPath)).to.be.false;

    fs.rmSync(temporaryDirectory, {recursive: true});
  }).timeout(Duration.ofSeconds(20).toMillis());
});
