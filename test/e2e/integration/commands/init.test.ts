// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';

import {type InitCommand} from '../../../../src/commands/init/init.js';
import {K8Client} from '../../../../src/integration/kube/k8-client/k8-client.js';
import sinon from 'sinon';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {DefaultKindClient} from '../../../../src/integration/kind/impl/default-kind-client.js';

describe('InitCommand', () => {
  let sandbox = sinon.createSandbox();
  let initCmd: InitCommand;

  before(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(K8Client.prototype, 'init').callsFake(() => this);
    sandbox.stub(DefaultKindClient.prototype, 'createCluster').callsFake(() => this);
    initCmd = container.resolve(InjectTokens.InitCommand);
  });

  after(() => {
    sandbox.restore();
  });

  describe('commands', () => {
    it('init execution should succeed', async () => {
      await expect(initCmd.init({})).to.eventually.equal(true);
    }).timeout(Duration.ofSeconds(60).toMillis());
  });

  describe('methods', () => {
    it('command definition should return a valid command def', () => {
      const commandDefinition = initCmd.getCommandDefinition();

      // @ts-ignore
      expect(commandDefinition.name).not.to.be.null;
      expect(commandDefinition.desc).not.to.be.null;
      expect(commandDefinition.handler).not.to.be.null;
    });
  });
});
