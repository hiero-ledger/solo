// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSpy} from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {GetNodesResponse} from '../../../../../src/integration/kind/model/get-nodes/get-nodes-response.js';
import {GetNodesOptionsBuilder} from '../../../../../src/integration/kind/model/get-nodes/get-nodes-options-builder.js';
import {type GetNodesOptions} from '../../../../../src/integration/kind/model/get-nodes/get-nodes-options.js';

describe('DefaultKindClient - getNodes', () => {
  let client: DefaultKindClient;
  let executionBuilderStub: sinon.SinonStubbedInstance<KindExecutionBuilder>;
  let executionStub: sinon.SinonStubbedInstance<KindExecution>;

  beforeEach(() => {
    client = new DefaultKindClient('/usr/local/bin/kind');
    executionBuilderStub = sinon.createStubInstance(KindExecutionBuilder);
    executionStub = sinon.createStubInstance(KindExecution);

    // Set up the builder stub
    executionBuilderStub.build.returns(executionStub as any);
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(executionStub as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should get nodes and parse the response correctly', async () => {
    const contextName: string = 'test-cluster';
    const nodesList: string = 'test-cluster-control-plane\ntest-cluster-worker\ntest-cluster-worker2';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(nodesList));
    });

    const result: GetNodesResponse = await client.getNodes(contextName);

    expect(result).to.be.instanceOf(GetNodesResponse);
    expect(result.nodes).to.deep.equal(['test-cluster-control-plane', 'test-cluster-worker', 'test-cluster-worker2']);
  });

  it('should handle "no nodes found" response', async () => {
    const contextName: string = 'empty-cluster';
    const noNodesOutput: string = 'No kind nodes found for cluster "empty-cluster".';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(noNodesOutput));
    });

    const result = await client.getNodes(contextName);

    expect(result).to.be.instanceOf(GetNodesResponse);
    expect(result.nodes).to.be.an('array').that.is.empty;
  });

  it('should handle multiple nodes from multiple clusters', async () => {
    const multiClusterOutput: string = 'solo-main-control-plane\nsolo-main-2-control-plane\ntest-cluster-control-plane';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(multiClusterOutput));
    });

    const options = GetNodesOptionsBuilder.builder().allClusters(true).build();

    const result = await client.getNodes(undefined, options);

    expect(result).to.be.instanceOf(GetNodesResponse);
    expect(result.nodes).to.deep.equal([
      'solo-main-control-plane',
      'solo-main-2-control-plane',
      'test-cluster-control-plane',
    ]);
  });

  it('should throw if responseAs throws', async () => {
    executionStub.responseAs.rejects(new Error('get nodes failed'));

    try {
      await client.getNodes('test-cluster');
      expect.fail('Expected error');
    } catch (error) {
      expect((error as Error).message).to.equal('get nodes failed');
    }
  });

  it('should pass context name to execution builder correctly', async () => {
    const contextName: string = 'options-test-cluster';

    // Create spies to track method calls
    const subcommandsSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'subcommands',
    );
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    await client.getNodes(contextName);

    // Verify subcommands were called correctly
    expect(subcommandsSpy.calledWith('get', 'nodes')).to.be.true;

    // Verify arguments were set correctly
    expect(argumentSpy.calledWith('name', contextName)).to.be.true;
  });

  it('should handle additional options correctly', async () => {
    const contextName: string = 'test-cluster';

    // Create spies to track method calls
    const flagSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(KindExecutionBuilder.prototype, 'flag');

    // Create options with allClusters flag set
    const options: GetNodesOptions = GetNodesOptionsBuilder.builder().allClusters(true).build();

    await client.getNodes(contextName, options);

    // Verify flag was set correctly
    expect(flagSpy.calledWith('--all-clusters')).to.be.true;
  });

  it('should handle undefined context name', async () => {
    // Create a spy for the argument method
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    // Call with undefined context name
    await client.getNodes();

    // Should not set name argument when undefined
    expect(argumentSpy.called).to.be.false;
  });

  it('should properly combine context name and options', async () => {
    const contextName: string = 'combined-options-cluster';

    // Create spies
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );
    const flagSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(KindExecutionBuilder.prototype, 'flag');

    // Create options with allClusters flag set
    const options: GetNodesOptions = GetNodesOptionsBuilder.builder().allClusters(true).build();

    await client.getNodes(contextName, options);

    // Verify arguments were set correctly
    expect(argumentSpy.calledWith('name', contextName)).to.be.true;
    expect(flagSpy.calledWith('--all-clusters')).to.be.true;
  });
});
