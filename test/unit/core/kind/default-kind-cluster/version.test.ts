// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon from 'sinon';
import {DefaultKindClient} from '../../../../../src/integration/kind/impl/default-kind-client.js';
import {SemVer} from 'semver';
import {KindVersion} from '../../../../../src/integration/kind/model/kind-version.js';
import {VersionRequest} from '../../../../../src/integration/kind/request/version-request.js';
import {KindExecutionBuilder} from '../../../../../src/integration/kind/execution/kind-execution-builder.js';

describe('DefaultKindClient - version', () => {
  let client: DefaultKindClient;

  beforeEach(() => {
    client = new DefaultKindClient();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return SemVer from KindVersion', async () => {
    // Arrange
    const fakeSemVersion = new SemVer('0.20.0');
    const fakeKindVersion = sinon.createStubInstance(KindVersion);
    fakeKindVersion.getVersion.returns(fakeSemVersion);

    // Stub VersionRequest.prototype.apply to do nothing
    sinon.stub(VersionRequest.prototype, 'apply').callsFake(() => {});

    // Stub KindExecutionBuilder.prototype.build to return a fake execution
    const fakeExecution = {
      responseAs: sinon.stub().resolves(fakeKindVersion),
    };
    // @ts-ignore
    sinon.stub(KindExecutionBuilder.prototype, 'build').returns(fakeExecution);

    // Act
    const result = await client.version();

    // Assert
    expect(result).to.be.instanceOf(SemVer);
    expect(result.version).to.equal('0.20.0');
    expect(fakeExecution.responseAs.calledOnce).to.be.true;
  });

  it('should throw if execution is a Promise', async () => {
    sinon.stub(VersionRequest.prototype, 'apply').callsFake(() => {});
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

  it('should throw if result is not KindVersion', async () => {
    sinon.stub(VersionRequest.prototype, 'apply').callsFake(() => {});
    const fakeExecution = {
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
