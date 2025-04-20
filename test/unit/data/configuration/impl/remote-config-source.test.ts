// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {RemoteConfigSource} from '../../../../../src/data/configuration/impl/remote-config-source.js';

describe('RemoteConfigSource', () => {
  let schema: any;
  let mapper: any;
  let backend: any;

  beforeEach(() => {
    schema = {};
    mapper = {};
    backend = {
      list: async () => [],
      readBytes: async (_key: string) => Buffer.from([]),
      writeBytes: async (_key: string, _data: Buffer) => {},
      readObject: async (_key: string) => ({}),
      writeObject: async (_key: string, _data: object) => {},
    };
  });

  it('should instantiate without error', () => {
    expect(() => new RemoteConfigSource(schema, mapper, backend)).not.to.throw();
  });

  it('should have name "RemoteConfigSource"', () => {
    const source: RemoteConfigSource = new RemoteConfigSource(schema, mapper, backend);
    expect(source.name).to.equal('RemoteConfigSource');
  });

  it('should have ordinal 300', () => {
    const source: RemoteConfigSource = new RemoteConfigSource(schema, mapper, backend);
    expect(source.ordinal).to.equal(300);
  });

  it('should call load() when refresh() is called', async () => {
    const source: RemoteConfigSource = new RemoteConfigSource(schema, mapper, backend);
    const loadStub = sinon.stub(source, 'load').resolves();
    await source.refresh();
    expect(loadStub.calledOnce).to.be.true;
    loadStub.restore();
  });
});
