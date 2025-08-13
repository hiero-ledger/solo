// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon from 'sinon';

import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {LoadDockerImageResponse} from '../../../../../src/integration/kind/model/load-docker-image/load-docker-image-response.js';
import {LoadDockerImageOptions} from '../../../../../src/integration/kind/model/load-docker-image/load-docker-image-options.js';

describe('DefaultKindClient.loadDockerImage', () => {
  let client: DefaultKindClient;
  let executionBuilderStub: sinon.SinonStubbedInstance<KindExecutionBuilder>;
  let executionStub: sinon.SinonStubbedInstance<KindExecution>;
  let builderArguments: Map<string, string>;
  let builderPositionals: string[];
  let builderSubcommands: string[];

  beforeEach(() => {
    client = new DefaultKindClient('/usr/local/bin/kind');
    executionBuilderStub = sinon.createStubInstance(KindExecutionBuilder);
    executionStub = sinon.createStubInstance(KindExecution);
    builderArguments = new Map<string, string>();
    builderPositionals = [];
    builderSubcommands = [];

    // Set up the builder stub
    executionBuilderStub.build.returns(executionStub as any);
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(executionStub as any);

    // Track the arguments and subcommands for verification
    sinon.stub(KindExecutionBuilder.prototype, 'argument').callsFake((name: string, value: string) => {
      builderArguments.set(name, value);
      return KindExecutionBuilder.prototype;
    });
    sinon.stub(KindExecutionBuilder.prototype, 'positional').callsFake((value: string) => {
      builderPositionals.push(value);
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

  it('should call the correct subcommands when loading a docker image', async () => {
    const imageName: string = 'test-image:latest';
    const imageId: string = 'sha256:1234567890abcdef';
    const mockOutput: string = `Image: "${imageName}" with ID "${imageId}"`;

    // Create output that contains the necessary patterns but with different text
    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    const result: LoadDockerImageResponse = await client.loadDockerImage(imageName);

    expect(result).to.be.instanceOf(LoadDockerImageResponse);
    expect(result.imageName).to.equal(imageName);
    expect(result.imageId).to.equal(imageId);

    // Verify the correct subcommands were used
    expect(builderSubcommands).to.include('load');
    expect(builderSubcommands).to.include('docker-image');
  });

  it('should throw if responseAs rejects', async () => {
    const imageName: string = 'test-image:fail';
    executionStub.responseAs.rejects(new Error('Failed to load image'));

    try {
      await client.loadDockerImage(imageName);
      expect.fail('Expected error to be thrown');
    } catch (error: unknown) {
      expect((error as Error).message).to.equal('Failed to load image');
    }
  });

  it('should pass nodes parameter when provided in options', async () => {
    const imageName: string = 'test-image:latest';
    const nodes: string = 'control-plane,worker1,worker2';
    const options: LoadDockerImageOptions = new LoadDockerImageOptions(undefined, undefined, nodes);
    const mockOutput: string = `Image: "${imageName}" with ID "sha256:1234567890abcdef"`;

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    await client.loadDockerImage(imageName, options);

    // Verify the nodes parameter was passed correctly
    expect(builderArguments.get('nodes')).to.equal(nodes);
  });

  it('should handle all parameters', async () => {
    const imageName: string = 'test-image:latest';
    const clusterName: string = 'custom-cluster';
    const nodes: string = 'worker1,worker2';
    const options: LoadDockerImageOptions = new LoadDockerImageOptions(imageName, clusterName, nodes);
    const mockOutput: string = `Image: "${imageName}" with ID "sha256:1234567890abcdef"`;

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    await client.loadDockerImage(imageName, options);

    // Verify both parameters were passed correctly
    expect(builderPositionals.length).to.equal(1);
    expect(builderPositionals[0]).to.equal(imageName);
    expect(builderArguments.get('name')).to.equal(clusterName);
    expect(builderArguments.get('nodes')).to.equal(nodes);
  });

  it('should parse complex image names correctly', async () => {
    const imageName: string = 'registry.example.com:5000/org/repo/image:v1.2.3-alpha.1';
    const imageId: string = 'sha256:abcdef1234567890';
    const mockOutput: string = `Image: "${imageName}" with ID "${imageId}"`;

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    const result: LoadDockerImageResponse = await client.loadDockerImage(imageName);

    // Verify the complex image name was parsed correctly
    expect(result.imageName).to.equal(imageName);
    expect(result.imageId).to.equal(imageId);
  });

  it('should handle malformed output format gracefully', async () => {
    const imageName: string = 'test-image:latest';
    const mockOutput: string = 'Kind loaded something but in an unexpected format';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    const result: LoadDockerImageResponse = await client.loadDockerImage(imageName);

    // Verify that we don't crash with malformed output
    expect(result).to.be.instanceOf(LoadDockerImageResponse);
    expect(result.imageName).to.be.undefined;
    expect(result.imageId).to.be.undefined;
  });

  it('should handle output with only image name but no ID', async () => {
    const imageName: string = 'test-image:latest';
    const mockOutput: string = `Image: "${imageName}" loaded successfully`;

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    const result: LoadDockerImageResponse = await client.loadDockerImage(imageName);

    // Verify partial match handling
    expect(result.imageName).to.be.undefined;
    expect(result.imageId).to.be.undefined;
  });

  it('should handle multi-line output format', async () => {
    const imageName: string = 'test-image:latest';
    const imageId: string = 'sha256:abcdef1234567890';
    const mockOutput: string = `Loading image: "${imageName}"
Processing...
Complete!
Image: "${imageName}" with ID "${imageId}"`;

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(mockOutput));
    });

    const result: LoadDockerImageResponse = await client.loadDockerImage(imageName);

    // Verify multi-line output is handled correctly
    expect(result.imageName).to.equal(imageName);
    expect(result.imageId).to.equal(imageId);
  });
});
