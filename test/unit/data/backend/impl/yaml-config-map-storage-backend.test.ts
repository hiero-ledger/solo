// SPDX-License-Identifier: Apache-2.0

import {YamlConfigMapStorageBackend} from '../../../../../src/data/backend/impl/yaml-config-map-storage-backend.js';
import {expect} from 'chai';
import sinon from 'sinon';
import {K8ClientConfigMap} from '../../../../../src/integration/kube/k8-client/resources/config-map/k8-client-config-map.js';
import {NamespaceName} from '../../../../../src/integration/kube/resources/namespace/namespace-name.js';

describe('YamlConfigMapStorageBackend', (): void => {
  let backend: YamlConfigMapStorageBackend;

  beforeEach((): void => {
    const namespace: NamespaceName = NamespaceName.of('test-ns');
    const configMap: K8ClientConfigMap = new K8ClientConfigMap(namespace, 'test-cm', {}, {});
    backend = new YamlConfigMapStorageBackend(configMap);
  });

  describe('readObject', (): void => {
    it('should parse YAML from readBytes', async (): Promise<void> => {
      const yamlString: string = 'foo: bar\nnum: 42\n';
      const stub: sinon.SinonStub = sinon.stub(backend, 'readBytes').resolves(Buffer.from(yamlString, 'utf8'));
      const result: object = await backend.readObject('some-key');
      expect(result).to.deep.equal({foo: 'bar', num: 42});
      stub.restore();
    });

    it('should throw if readBytes returns empty buffer', async (): Promise<void> => {
      sinon.stub(backend, 'readBytes').resolves(Buffer.from('', 'utf8'));
      await expect(backend.readObject('empty-key')).to.be.rejectedWith('data is empty for key: empty-key');
    });

    it('should throw if readBytes returns undefined', async (): Promise<void> => {
      sinon.stub(backend, 'readBytes').resolves(undefined as never);
      await expect(backend.readObject('missing-key')).to.be.rejectedWith(
        'failed to read key: missing-key from config map',
      );
    });

    it('should throw on invalid YAML', async (): Promise<void> => {
      sinon.stub(backend, 'readBytes').resolves(Buffer.from('not: [valid, yaml', 'utf8'));
      await expect(backend.readObject('bad-yaml')).to.be.rejectedWith('error parsing yaml from key: bad-yaml');
    });
  });

  describe('writeObject', (): void => {
    it('should write YAML string to writeBytes', async (): Promise<void> => {
      const stub: sinon.SinonStub = sinon.stub(backend, 'writeBytes').resolves();
      const data: object = {foo: 'bar', num: 42};
      await backend.writeObject('some-key', data);
      expect(stub.calledOnce).to.be.true;
      const written: string = stub.firstCall.args[1].toString('utf8');
      expect(written).to.include('foo: bar');
      expect(written).to.include('num: 42');
      stub.restore();
    });

    it('should throw if data is null or undefined', async (): Promise<void> => {
      await expect(backend.writeObject('some-key', undefined as never)).to.be.rejectedWith(
        'data must not be null or undefined',
      );
    });

    it('should throw if writeBytes throws', async (): Promise<void> => {
      sinon.stub(backend, 'writeBytes').rejects(new Error('fail'));
      await expect(backend.writeObject('some-key', {foo: 'bar'})).to.be.rejectedWith(
        'error writing yaml for key: some-key to config map',
      );
    });
  });
});
