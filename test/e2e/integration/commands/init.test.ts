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
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type ClusterCreateResponse} from '../../../../src/integration/kind/model/create-cluster/cluster-create-response.js';
import {type CommandDefinition} from '../../../../src/types/index.js';

describe('InitCommand', (): void => {
  let sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let initCmd: InitCommand;

  before((): void => {
    sandbox = sinon.createSandbox();
    sandbox.stub(K8Client.prototype, 'init').callsFake((): K8 => this);
    sandbox.stub(DefaultKindClient.prototype, 'createCluster').callsFake((): Promise<ClusterCreateResponse> => this);
    initCmd = container.resolve(InjectTokens.InitCommand);
  });

  after((): void => {
    sandbox.restore();
  });

  describe('commands', (): void => {
    it('init execution should succeed', async (): Promise<void> => {
      await expect(initCmd.init({})).to.eventually.equal(true);
    }).timeout(Duration.ofSeconds(60).toMillis());
  });

  describe('methods', (): void => {
    it('command definition should return a valid command def', (): void => {
      const commandDefinition: CommandDefinition = initCmd.getCommandDefinition();

      // @ts-ignore
      expect(commandDefinition.name).not.to.be.null;
      expect(commandDefinition.desc).not.to.be.null;
      expect(commandDefinition.handler).not.to.be.null;
    });
  });
});
