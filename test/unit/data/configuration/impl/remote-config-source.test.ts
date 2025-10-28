// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {RemoteConfigSource} from '../../../../../src/data/configuration/impl/remote-config-source.js';
import {RemoteConfigSchemaDefinition} from '../../../../../src/data/schema/migration/impl/remote/remote-config-schema-definition.js';
import {SimpleObjectStorageBackend} from '../../../fixtures/simple-object-storage-backend.fixture.js';
import {type ObjectMapper} from '../../../../../src/data/mapper/api/object-mapper.js';

describe('RemoteConfigSource', (): void => {
  let schema: RemoteConfigSchemaDefinition;
  let mapper: ObjectMapper;
  let backend: SimpleObjectStorageBackend;
  let source: RemoteConfigSource;
  const map: Map<string, object> = new Map<string, object>([
    [
      'local-config',
      {
        schemaVersion: 1,
        deployments: [{name: 'true', namespace: 'false', clusters: ['true', {key: 'value'}, '{"key": "value"}']}],
      },
    ],
  ]);
  beforeEach((): void => {
    mapper = {} as ObjectMapper;
    schema = new RemoteConfigSchemaDefinition(mapper);
    backend = new SimpleObjectStorageBackend(map);
    sinon.stub(backend, 'writeObject').resolves();
    source = new RemoteConfigSource(schema, mapper, backend);
    mapper.applyPropertyValue = sinon.stub();
  });

  it('should call backend.writeObject on persist', async (): Promise<void> => {
    await source.persist();
    expect((backend.writeObject as sinon.SinonStub).calledOnce).to.be.true;
  });

  it('should instantiate without error', (): void => {
    expect((): RemoteConfigSource => new RemoteConfigSource(schema, mapper, backend)).not.to.throw();
  });

  it('should have name "RemoteConfigSource"', (): void => {
    const source: RemoteConfigSource = new RemoteConfigSource(schema, mapper, backend);
    expect(source.name).to.equal('RemoteConfigSource');
  });

  it('should have ordinal 300', (): void => {
    const source: RemoteConfigSource = new RemoteConfigSource(schema, mapper, backend);
    expect(source.ordinal).to.equal(300);
  });

  it('should call load() when refresh() is called', async (): Promise<void> => {
    const source: RemoteConfigSource = new RemoteConfigSource(schema, mapper, backend);
    const loadStub: sinon.SinonStub = sinon.stub(source, 'load').resolves();
    await source.refresh();
    expect(loadStub.calledOnce).to.be.true;
    loadStub.restore();
  });

  it('should throw if putObject called with missing key', (): void => {
    expect((): void => source.putObject(undefined as never, {foo: 1})).to.throw('key must not be null or undefined');
  });

  it('should throw if putObjectArray called with missing key', (): void => {
    expect((): void => source.putObjectArray(undefined as never, [{foo: 1}])).to.throw(
      'key must not be null or undefined',
    );
  });

  it('should throw if putScalar called with missing key', (): void => {
    expect((): void => source.putScalar(undefined as never, 'val')).to.throw('key must not be null or undefined');
  });

  it('should throw if putScalarArray called with missing key', (): void => {
    expect((): void => source.putScalarArray(undefined as never, ['a'])).to.throw('key must not be null or undefined');
  });
});
