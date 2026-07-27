// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonStubbedInstance} from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {KindVersion} from '../../../../../src/integration/kind/model/kind-version.js';
import {VersionRequest} from '../../../../../src/integration/kind/request/version-request.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';
import {SemanticVersion} from '../../../../../src/business/utils/semantic-version.js';

describe('DefaultKindClient - version', (): void => {
  let client: DefaultKindClient;

  beforeEach((): void => {
    client = new DefaultKindClient('/usr/local/bin/kind');
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('should return SemanticVersion<string> from KindVersion', async (): Promise<void> => {
    // Arrange
    const fakeSemanticVersion: SemanticVersion<string> = new SemanticVersion<string>('0.20.0');
    const fakeKindVersion: SinonStubbedInstance<KindVersion> = sinon.createStubInstance(KindVersion);
    fakeKindVersion.getVersion.returns(fakeSemanticVersion);

    // Stub VersionRequest.prototype.apply to do nothing
    sinon.stub(VersionRequest.prototype, 'apply').callsFake((): void => {});

    // Stub KindExecutionBuilder.prototype.build to return a fake execution
    const fakeExecution: {responseAs: sinon.SinonStub} = {
      responseAs: sinon.stub().resolves(fakeKindVersion),
    };
    // @ts-ignore
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(fakeExecution);

    // Act
    const result: SemanticVersion<string> = await client.version();

    // Assert
    expect(result).to.be.instanceOf(SemanticVersion<string>);
    expect(result.toString()).to.equal('0.20.0');
    expect(fakeExecution.responseAs.calledOnce).to.be.true;
  });

  it('should throw if execution is a Promise', async (): Promise<void> => {
    sinon.stub(VersionRequest.prototype, 'apply').callsFake((): void => {});
    // @ts-ignore
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(Promise.resolve());

    try {
      await client.version();
      expect.fail('Expected error');
    } catch (error) {
      expect(error).to.be.instanceOf(TypeError);
      expect((error as Error).message).to.equal('Unexpected async execution');
    }
  });

  it('should throw if result is not KindVersion', async (): Promise<void> => {
    sinon.stub(VersionRequest.prototype, 'apply').callsFake((): void => {});
    const fakeExecution: {responseAs: sinon.SinonStub} = {
      responseAs: sinon.stub().resolves({}),
    };
    // @ts-ignore
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(fakeExecution);

    try {
      await client.version();
      expect.fail('Expected error');
    } catch (error) {
      expect(error).to.be.instanceOf(TypeError);
      expect((error as Error).message).to.equal('Unexpected response type');
    }
  });
});
