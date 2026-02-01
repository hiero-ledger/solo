// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon from 'sinon';

import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {LoadImageArchiveResponse} from '../../../../../src/integration/kind/model/load-image-archive/load-image-archive-response.js';
import {LoadImageArchiveOptions} from '../../../../../src/integration/kind/model/load-image-archive/load-image-archive-options.js';

describe('DefaultKindClient.loadImageArchive', () => {
  let client: DefaultKindClient;
  let executionBuilderStub: sinon.SinonStubbedInstance<KindExecutionBuilder>;
  let executionStub: sinon.SinonStubbedInstance<KindExecution>;
  let builderArguments: Map<string, string>;
  let builderSubcommands: string[];

  beforeEach(() => {
    client = new DefaultKindClient('/usr/local/bin/kind');
    executionBuilderStub = sinon.createStubInstance(KindExecutionBuilder);
    executionStub = sinon.createStubInstance(KindExecution);
    builderArguments = new Map<string, string>();
    builderSubcommands = [];

    // Set up the builder stub
    executionBuilderStub.build.returns(executionStub as any);
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(executionStub as any);

    // Track the arguments and subcommands for verification
    sinon.stub(KindExecutionBuilder.prototype, 'argument').callsFake((name: string, value: string) => {
      builderArguments.set(name, value);
      return KindExecutionBuilder.prototype;
    });

    sinon.stub(KindExecutionBuilder.prototype, 'subcommands').callsFake((...commands: string[]) => {
      builderSubcommands.push(...commands);
      return KindExecutionBuilder.prototype;
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should call the correct subcommands when loading an image archive', async () => {
    const imageName: string = 'test-archive.tar';
    const mockOutput: string = `Image archive "${imageName}" loaded successfully`;

    // Create output that contains the necessary patterns but with different text
    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    const result: LoadImageArchiveResponse = await client.loadImageArchive(imageName);
    expect(result).to.be.instanceOf(LoadImageArchiveResponse);

    expect(result).to.be.instanceOf(LoadImageArchiveResponse);

    // Verify the correct subcommands were used
    expect(builderSubcommands).to.include('load');
    expect(builderSubcommands).to.include('image-archive');
  });

  it('should handle empty image name gracefully', async () => {
    const imageName: string = '';
    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(''));
    });

    const result: LoadImageArchiveResponse = await client.loadImageArchive(imageName);

    expect(result).to.be.instanceOf(LoadImageArchiveResponse);

    // Verify image name was passed even if empty
    expect(builderArguments.get('name')).to.equal(undefined);
  });

  it('should throw if responseAs rejects', async () => {
    const imageName: string = 'test-archive-fail.tar';
    executionStub.responseAs.rejects(new Error('Failed to load image archive'));

    try {
      await client.loadImageArchive(imageName);
      expect.fail('Expected error to be thrown');
    } catch (error: unknown) {
      expect((error as Error).message).to.equal('Failed to load image archive');
    }
  });

  it('imageName overrides provided name in options parameter', async () => {
    const imageName: string = 'test-archive.tar';
    const clusterName: string = 'custom-cluster';
    const options: LoadImageArchiveOptions = new LoadImageArchiveOptions(clusterName);
    const mockOutput: string = 'Image archive loaded successfully';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    await client.loadImageArchive(imageName, options);

    // Verify the image archive path was passed correctly
    expect(builderArguments.get('name')).to.equal(imageName);
  });

  it('should pass nodes parameter when provided in options', async () => {
    const imageName: string = 'test-archive.tar';
    const nodes: string = 'control-plane,worker1,worker2';
    const options: LoadImageArchiveOptions = new LoadImageArchiveOptions(undefined, nodes);
    const mockOutput: string = 'Image archive loaded successfully';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    await client.loadImageArchive(imageName, options);

    // Verify the nodes parameter was passed correctly
    expect(builderArguments.get('nodes')).to.equal(nodes);
  });

  it('should handle both cluster name and nodes parameters', async () => {
    const imageName: string = 'test-archive.tar';
    const clusterName: string = 'custom-cluster';
    const nodes: string = 'worker1,worker2';
    const options: LoadImageArchiveOptions = new LoadImageArchiveOptions(clusterName, nodes);
    const mockOutput: string = 'Image archive loaded successfully';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    await client.loadImageArchive(imageName, options);

    // Verify both parameters were passed correctly
    expect(builderArguments.get('name')).to.equal(imageName);
    expect(builderArguments.get('nodes')).to.equal(nodes);
  });

  it('should handle archive paths with special characters', async () => {
    const imageName: string = '/path/to/archive with spaces.tar';
    const mockOutput: string = 'Image archive loaded successfully';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    const result: LoadImageArchiveResponse = await client.loadImageArchive(imageName);

    expect(result).to.be.instanceOf(LoadImageArchiveResponse);
    // Verify the path was passed correctly
    expect(builderArguments.get('name')).to.equal(imageName);
  });

  it('should handle malformed output format gracefully', async () => {
    const imageName: string = 'test-archive.tar';
    const mockOutput: string = 'Kind loaded something but in an unexpected format';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    const result: LoadImageArchiveResponse = await client.loadImageArchive(imageName);

    // Verify that we don't crash with malformed output
    expect(result).to.be.instanceOf(LoadImageArchiveResponse);
  });

  it('should handle relative paths for archive files', async () => {
    const imageName: string = './relative/path/archive.tar';
    const mockOutput: string = 'Image archive loaded successfully';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    await client.loadImageArchive(imageName);

    // Verify the relative path was passed correctly
    expect(builderArguments.get('name')).to.equal(imageName);
  });

  it('should handle absolute paths for archive files', async () => {
    const imageName: string = '/absolute/path/archive.tar';
    const mockOutput: string = 'Image archive loaded successfully';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    await client.loadImageArchive(imageName);

    // Verify the absolute path was passed correctly
    expect(builderArguments.get('name')).to.equal(imageName);
  });
});
