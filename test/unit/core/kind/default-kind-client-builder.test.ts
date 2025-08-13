// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {DefaultKindClientBuilder} from '../../../../src/integration/kind/impl/default-kind-client-builder.js';
import {DefaultKindClient} from '../../../../src/integration/kind/impl/default-kind-client.js';
import {KindVersionRequirementException} from '../../../../src/integration/kind/errors/kind-version-requirement-exception.js';

describe('DefaultKindClientBuilder', () => {
  let builder: DefaultKindClientBuilder;
  let checkVersionStub: Sinon.SinonStub;
  const testExecutable = '/usr/local/bin/kind';

  beforeEach(() => {
    builder = new DefaultKindClientBuilder();

    // Since checkVersion is called in build, we need to stub it
    checkVersionStub = Sinon.stub(DefaultKindClient.prototype, 'checkVersion');
    checkVersionStub.resolves();
  });

  afterEach(() => {
    checkVersionStub.restore();
  });

  describe('constructor', () => {
    it('should create an instance without errors', () => {
      expect(builder).to.be.instanceOf(DefaultKindClientBuilder);
    });
  });

  describe('executable', () => {
    it('should set the executable path and return this for chaining', () => {
      const result = builder.executable(testExecutable);
      expect(result).to.equal(builder);
    });
  });

  describe('build', () => {
    it('should build a KindClient with the provided executable path', async () => {
      const client = await builder.executable(testExecutable).build();

      expect(client).to.be.instanceOf(DefaultKindClient);
      expect(checkVersionStub.calledOnce).to.be.true;
    });

    it('should throw an error if version check fails', async () => {
      const versionError = new KindVersionRequirementException('Version error');
      checkVersionStub.rejects(versionError);

      try {
        await builder.executable(testExecutable).build();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.equal(versionError);
      }
    });
  });
});
