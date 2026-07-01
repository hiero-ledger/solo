// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {DefaultKindClientBuilder} from '../../../../src/integration/kind/impl/default-kind-client-builder.js';
import {DefaultKindClient} from '../../../../src/integration/kind/impl/default-kind-client.js';
import {type KindClient} from '../../../../src/integration/kind/kind-client.js';
import {KindVersionRequirementException} from '../../../../src/integration/kind/errors/kind-version-requirement-exception.js';

describe('DefaultKindClientBuilder', (): void => {
  let builder: DefaultKindClientBuilder;
  let checkVersionStub: Sinon.SinonStub;
  const testExecutable: string = '/usr/local/bin/kind';

  beforeEach((): void => {
    builder = new DefaultKindClientBuilder();

    // Since checkVersion is called in build, we need to stub it
    checkVersionStub = Sinon.stub(DefaultKindClient.prototype, 'checkVersion');
    checkVersionStub.resolves();
  });

  afterEach((): void => {
    checkVersionStub.restore();
  });

  describe('constructor', (): void => {
    it('should create an instance without errors', (): void => {
      expect(builder).to.be.instanceOf(DefaultKindClientBuilder);
    });
  });

  describe('executable', (): void => {
    it('should set the executable path and return this for chaining', (): void => {
      const result: DefaultKindClientBuilder = builder.executable(testExecutable);
      expect(result).to.equal(builder);
    });
  });

  describe('build', (): void => {
    it('should build a KindClient with the provided executable path', async (): Promise<void> => {
      const client: KindClient = await builder.executable(testExecutable).build();

      expect(client).to.be.instanceOf(DefaultKindClient);
      expect(checkVersionStub.calledOnce).to.be.true;
    });

    it('should throw an error if version check fails', async (): Promise<void> => {
      const versionError: KindVersionRequirementException = new KindVersionRequirementException('Version error');
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
