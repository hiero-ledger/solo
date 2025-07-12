// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSpy} from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {ClusterDeleteResponse} from '../../../../../src/integration/kind/model/delete-cluster/cluster-delete-response.js';
import {type ClusterDeleteOptions} from '../../../../../src/integration/kind/model/delete-cluster/cluster-delete-options.js';

describe('DefaultKindClient - deleteCluster', () => {
  let client: DefaultKindClient;
  let executionBuilderStub: sinon.SinonStubbedInstance<KindExecutionBuilder>;
  let executionStub: sinon.SinonStubbedInstance<KindExecution>;

  beforeEach(() => {
    client = new DefaultKindClient();
    executionBuilderStub = sinon.createStubInstance(KindExecutionBuilder);
    executionStub = sinon.createStubInstance(KindExecution);

    // Set up the builder stub
    executionBuilderStub.build.returns(executionStub as any);
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(executionStub as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should delete a cluster and parse the response correctly', async () => {
    const clusterName: string = 'test-cluster';

    executionStub.responseAs.callsFake((responseClass: any) => {
      const output: string = `Deleting cluster "${clusterName}" ...
Deleted nodes: ["${clusterName}-control-plane"]`;
      return Promise.resolve(new responseClass(output));
    });

    const result: ClusterDeleteResponse = await client.deleteCluster(clusterName);

    expect(result).to.be.instanceOf(ClusterDeleteResponse);
    expect(result.name).to.equal(clusterName);
    expect(result.deletedNodes).to.deep.equal([`${clusterName}-control-plane`]);
  });

  it('should throw if responseAs throws', async () => {
    executionStub.responseAs.rejects(new Error('fail'));

    try {
      await client.deleteCluster('test-cluster');
      expect.fail('Expected error');
    } catch (error) {
      expect((error as Error).message).to.equal('fail');
    }
  });

  it('should handle output with multiple deleted nodes', async () => {
    const clusterName: string = 'multi-node-cluster';

    executionStub.responseAs.callsFake((responseClass: any) => {
      const output: string = `Deleting cluster "${clusterName}" ...
Deleted nodes: ["${clusterName}-control-plane", "${clusterName}-worker", "${clusterName}-worker2"]`;
      return Promise.resolve(new responseClass(output));
    });

    const result: ClusterDeleteResponse = await client.deleteCluster(clusterName);

    expect(result.name).to.equal(clusterName);
    expect(result.deletedNodes).to.deep.equal([
      `${clusterName}-control-plane`,
      `${clusterName}-worker`,
      `${clusterName}-worker2`,
    ]);
  });

  it('should handle output without deleted nodes information', async () => {
    const clusterName: string = 'no-nodes-cluster';

    executionStub.responseAs.callsFake((responseClass: any) => {
      const output: string = `Deleting cluster "${clusterName}" ...`;
      return Promise.resolve(new responseClass(output));
    });

    const result: ClusterDeleteResponse = await client.deleteCluster(clusterName);

    expect(result.name).to.equal(clusterName);
    expect(result.deletedNodes).to.be.an('array').that.is.empty;
  });

  it('should pass cluster name and options to execution builder', async () => {
    const clusterName: string = 'options-test-cluster';
    const options: ClusterDeleteOptions = {
      name: clusterName,
      kubeconfig: './custom-config.yaml',
    } as ClusterDeleteOptions;

    // Create spies to track method calls
    const subcommandsSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'subcommands',
    );
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    await client.deleteCluster(clusterName, options);

    // Verify subcommands were called correctly
    expect(subcommandsSpy.calledWith('delete', 'cluster')).to.be.true;

    // Verify arguments were set correctly
    expect(argumentSpy.calledWith('name', clusterName)).to.be.true;
    expect(argumentSpy.calledWith('kubeconfig', options.kubeconfig)).to.be.true;
  });

  it('should handle no options provided', async () => {
    const clusterName: string = 'default-options-cluster';

    executionStub.responseAs.callsFake((responseClass: any) => {
      const output: string = `Deleting cluster "${clusterName}" ...
Deleted nodes: ["${clusterName}-control-plane"]`;
      return Promise.resolve(new responseClass(output));
    });

    // Create a spy to track argument calls
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    const result: ClusterDeleteResponse = await client.deleteCluster(clusterName);

    // Verify only name parameter was set
    expect(argumentSpy.calledWith('name', clusterName)).to.be.true;

    // Check number of calls to argument to verify no other arguments were set
    expect(argumentSpy.callCount).to.equal(1);

    // Response should be correct
    expect(result.name).to.equal(clusterName);
  });
});
