// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSpy} from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {ExportLogsResponse} from '../../../../../src/integration/kind/model/export-logs/export-logs-response.js';

describe('DefaultKindClient - exportLogs', (): void => {
  let client: DefaultKindClient;
  let executionBuilderStub: sinon.SinonStubbedInstance<KindExecutionBuilder>;
  let executionStub: sinon.SinonStubbedInstance<KindExecution>;

  beforeEach((): void => {
    client = new DefaultKindClient('/usr/local/bin/kind');
    executionBuilderStub = sinon.createStubInstance(KindExecutionBuilder);
    executionStub = sinon.createStubInstance(KindExecution);

    // Set up the builder stub
    executionBuilderStub.build.returns(executionStub as any);
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(executionStub as any);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should export logs and parse the response correctly', async (): Promise<void> => {
    const clusterName: string = 'test-cluster';
    const exportPath: string = '/tmp/kind-logs-test-cluster-2025-07-10T12-34-56';

    executionStub.responseAs.callsFake((responseClass: any): Promise<ExportLogsResponse> => {
      const output: string = exportPath;
      return Promise.resolve(new responseClass(output));
    });

    const result: ExportLogsResponse = await client.exportLogs(clusterName);

    expect(result).to.be.instanceOf(ExportLogsResponse);
    expect(result.exportPath).to.equal(exportPath);
  });

  it('should throw if responseAs throws', async (): Promise<void> => {
    executionStub.responseAs.rejects(new Error('export logs failed'));

    try {
      await client.exportLogs('test-cluster');
      expect.fail('Expected error');
    } catch (error) {
      expect((error as Error).message).to.equal('export logs failed');
    }
  });

  it('should pass cluster name to execution builder correctly', async (): Promise<void> => {
    const clusterName: string = 'options-test-cluster';

    // Create spies to track method calls
    const subcommandsSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'subcommands',
    );
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    await client.exportLogs(clusterName);

    // Verify subcommands were called correctly
    expect(subcommandsSpy.calledWith('export', 'logs')).to.be.true;

    // Verify arguments were set correctly
    expect(argumentSpy.calledWith('name', clusterName)).to.be.true;
  });

  it('should handle undefined cluster name', async (): Promise<void> => {
    // Create a spy for subcommands and argument methods
    const subcommandsSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'subcommands',
    );
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    // Output with default 'kind' cluster name
    const output: string = '/tmp/kind-logs-kind-2025-07-10T12-34-56';
    executionStub.responseAs.callsFake((responseClass: any): Promise<ExportLogsResponse> => {
      return Promise.resolve(new responseClass(output));
    });

    const result: ExportLogsResponse = await client.exportLogs();

    // Verify subcommands were called correctly
    expect(subcommandsSpy.calledWith('export', 'logs')).to.be.true;

    // Should not set name argument when undefined
    expect(argumentSpy.callCount).to.equal(0);
    expect(result.exportPath).to.be.equal(output);
  });
});
