// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonStub} from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindCluster} from '../../../../../src/integration/kind/model/kind-cluster.js';

describe('DefaultKindClient - getClusters', () => {
  let client: DefaultKindClient;
  let executeAsListStub: SinonStub;

  beforeEach(() => {
    client = new DefaultKindClient();
    executeAsListStub = sinon.stub(client as any, 'executeAsList');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('getClusters should call executeAsList and return clusters', async () => {
    const clusters = [new KindCluster('test1'), new KindCluster('test2')];
    executeAsListStub.resolves(clusters);

    const result = await client.getClusters();

    expect(result).to.be.an('array');
    for (const cluster of result) {
      expect(cluster).to.be.instanceOf(KindCluster);
      expect(cluster.name).to.be.a('string');
      expect(cluster.name).to.not.be.empty;
    }

    expect(executeAsListStub.calledOnce).to.be.true;
    expect(result).to.deep.equal(clusters);
  });

  it('getClusters should propagate errors from executeAsList', async () => {
    executeAsListStub.rejects(new Error('fail'));
    try {
      await client.getClusters();
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect((error as Error).message).to.equal('fail');
    }
  });
});
