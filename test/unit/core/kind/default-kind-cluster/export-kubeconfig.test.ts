// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSpy} from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {ExportKubeConfigResponse} from '../../../../../src/integration/kind/model/export-kubeconfig/export-kubeconfig-response.js';

describe('DefaultKindClient - exportKubeConfig', () => {
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

  it('should export kubeconfig and parse the response correctly', async () => {
    const clusterName = 'test-cluster';
    const kubeConfigContext = 'kind-test-cluster';

    executionStub.responseAs.callsFake((responseClass: any) => {
      const output = `Set kubectl context to "${kubeConfigContext}"`;
      return Promise.resolve(new responseClass(output));
    });

    const result = await client.exportKubeConfig(clusterName);

    expect(result).to.be.instanceOf(ExportKubeConfigResponse);
    expect(result.kubeConfigContext).to.equal(kubeConfigContext);
  });

  it('should throw if responseAs throws', async () => {
    executionStub.responseAs.rejects(new Error('export kubeconfig failed'));

    try {
      await client.exportKubeConfig('test-cluster');
      expect.fail('Expected error');
    } catch (error) {
      expect((error as Error).message).to.equal('export kubeconfig failed');
    }
  });

  it('should pass cluster name to execution builder correctly', async () => {
    const clusterName = 'options-test-cluster';

    // Create spies to track method calls
    const subcommandsSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'subcommands',
    );
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    await client.exportKubeConfig(clusterName);

    // Verify subcommands were called correctly
    expect(subcommandsSpy.calledWith('export', 'kubeconfig')).to.be.true;

    // Verify arguments were set correctly
    expect(argumentSpy.calledWith('name', clusterName)).to.be.true;
  });

  it('should work when no cluster name is provided', async () => {
    // Output with default 'kind' cluster name
    executionStub.responseAs.callsFake((responseClass: any) => {
      const output = 'Set kubectl context to "kind-kind"';
      return Promise.resolve(new responseClass(output));
    });

    const result = await client.exportKubeConfig();

    // Response should contain default context name
    expect(result.kubeConfigContext).to.equal('kind-kind');
  });

  it('should handle malformed output response', async () => {
    executionStub.responseAs.callsFake((responseClass: any) => {
      // Output missing the expected format
      const output = 'KubeConfig exported but no context information provided';
      return Promise.resolve(new responseClass(output));
    });

    const result = await client.exportKubeConfig('malformed-output');

    expect(result).to.be.instanceOf(ExportKubeConfigResponse);
    expect(result.kubeConfigContext).to.be.undefined;
  });
});
