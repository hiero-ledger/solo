// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSpy} from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {KindExecution} from '../../../../../src/integration/kind/execution/kind-execution.js';
import {BuildNodeImagesResponse} from '../../../../../src/integration/kind/model/build-node-images/build-node-images-response.js';
import {type BuildNodeImagesOptions} from '../../../../../src/integration/kind/model/build-node-images/build-node-images-options.js';
import {BuildNodeImageTypes} from '../../../../../src/integration/kind/model/build-node-images/build-node-image-type.js';
import {BuildNodeImagesOptionsBuilder} from '../../../../../src/integration/kind/model/build-node-images/build-node-images-options-builder.js';

describe('DefaultKindClient - buildNodeImage', () => {
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

  it('should build a node image and return the response correctly', async () => {
    const expectedOutput = 'Image build completed successfully';

    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass(expectedOutput));
    });

    const options = BuildNodeImagesOptionsBuilder.builder()
      .image('kindest/node:v1.29.0')
      .arch('amd64')
      .baseImage('docker.io/kindest/base:v20250214-acbabc1a')
      .type(BuildNodeImageTypes.SOURCE)
      .build();

    const result = await client.buildNodeImage(options);

    expect(result).to.be.instanceOf(BuildNodeImagesResponse);
    // We can't directly access _rawOutput since it's protected, but we can verify the instance
    expect(result).to.not.be.undefined;
  });

  it('should throw if responseAs throws', async () => {
    executionStub.responseAs.rejects(new Error('build failed'));

    const options: BuildNodeImagesOptions = BuildNodeImagesOptionsBuilder.builder()
      .image('kindest/node:v1.29.0')
      .build();

    try {
      await client.buildNodeImage(options);
      expect.fail('Expected error');
    } catch (error) {
      expect((error as Error).message).to.equal('build failed');
    }
  });

  it('should pass options to execution builder correctly', async () => {
    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass('Success'));
    });

    // Create spies to track method calls
    const subcommandsSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'subcommands',
    );
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    const options = BuildNodeImagesOptionsBuilder.builder()
      .image('kindest/node:v1.30.0')
      .arch('arm64')
      .baseImage('custom/base:latest')
      .type(BuildNodeImageTypes.URL)
      .build();

    await client.buildNodeImage(options);

    // Verify subcommands were called correctly
    expect(subcommandsSpy.calledWith('build', 'node-image')).to.be.true;

    // Verify arguments were set correctly
    expect(argumentSpy.calledWith('image', 'kindest/node:v1.30.0')).to.be.true;
    expect(argumentSpy.calledWith('arch', 'arm64')).to.be.true;
    expect(argumentSpy.calledWith('base-image', 'custom/base:latest')).to.be.true;
    expect(argumentSpy.calledWith('type', BuildNodeImageTypes.URL)).to.be.true;
  });

  it('should work with no options provided', async () => {
    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass('Default build completed'));
    });

    // Create spy for subcommands method
    const subcommandsSpy: SinonSpy<string[], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'subcommands',
    );

    await client.buildNodeImage();

    // Verify subcommands were still called correctly
    expect(subcommandsSpy.calledWith('build', 'node-image')).to.be.true;
  });

  it('should handle partial options', async () => {
    executionStub.responseAs.callsFake((responseClass: any) => {
      return Promise.resolve(new responseClass('Partial options build completed'));
    });

    // Create spy for argument method
    const argumentSpy: SinonSpy<[name: string, value: string], KindExecutionBuilder> = sinon.spy(
      KindExecutionBuilder.prototype,
      'argument',
    );

    // Test with only image option provided
    const options: BuildNodeImagesOptions = BuildNodeImagesOptionsBuilder.builder().image('custom/node:test').build();

    await client.buildNodeImage(options);

    // Verify only image argument was set
    expect(argumentSpy.calledWith('image', 'custom/node:test')).to.be.true;
    expect(argumentSpy.callCount).to.equal(1);
  });
});
