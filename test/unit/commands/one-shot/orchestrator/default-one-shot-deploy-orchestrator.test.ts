// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {DefaultOneShotDeployOrchestrator} from '../../../../../src/commands/one-shot/orchestrator/default-one-shot-deploy-orchestrator.js';
import {type DeployBlockNodeStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-block-node-step.js';
import {type DeployNetworkPipelineStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-network-pipeline-step.js';
import {type DeployMirrorNodeStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-mirror-node-step.js';
import {type DeployExplorerStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-explorer-step.js';
import {type DeployRelayStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-relay-step.js';
import {type SoloEventBus} from '../../../../../src/core/events/solo-event-bus.js';
import {SoloEventType} from '../../../../../src/core/events/event-types/event-types.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../../../../../src/commands/one-shot/one-shot-single-deploy-context.js';
import {type SoloListrTaskWrapper} from '../../../../../src/types/index.js';
import {NamespaceName} from '../../../../../src/types/namespace/namespace-name.js';

function makeConfig(overrides: Partial<OneShotSingleDeployConfigClass> = {}): OneShotSingleDeployConfigClass {
  return {
    deployment: 'test-deployment',
    namespace: NamespaceName.of('test-ns'),
    clusterRef: 'test-cluster',
    parallelDeploy: false,
    deployMirrorNode: true,
    deployExplorer: true,
    deployRelay: true,
    minimalSetup: false,
    predefinedAccounts: false,
    versions: {explorer: '1.0.0', soloChart: '', consensus: '', mirror: '', relay: '', blockNode: ''},
    blockNodeConfiguration: {},
    mirrorNodeConfiguration: {},
    explorerNodeConfiguration: {},
    relayNodeConfiguration: {},
    networkConfiguration: {},
    setupConfiguration: {},
    consensusNodeConfiguration: {},
    ...overrides,
  } as OneShotSingleDeployConfigClass;
}

describe('DefaultOneShotDeployOrchestrator', (): void => {
  let orchestrator: DefaultOneShotDeployOrchestrator;
  let blockNodeStepStub: DeployBlockNodeStep;
  let networkPipelineStepStub: DeployNetworkPipelineStep;
  let mirrorNodeStepStub: DeployMirrorNodeStep;
  let explorerStepStub: DeployExplorerStep;
  let relayStepStub: DeployRelayStep;
  let eventBusStub: SoloEventBus;
  let waitForStub: SinonStub;

  beforeEach((): void => {
    blockNodeStepStub = {asListrTask: sinon.stub().returns({title: 'block-task'})} as unknown as DeployBlockNodeStep;
    networkPipelineStepStub = {
      asListrTask: sinon.stub().returns({title: 'network-task'}),
    } as unknown as DeployNetworkPipelineStep;
    mirrorNodeStepStub = {
      asListrTask: sinon.stub().returns({title: 'mirror-task'}),
    } as unknown as DeployMirrorNodeStep;
    explorerStepStub = {
      asListrTask: sinon.stub().returns({title: 'explorer-task'}),
    } as unknown as DeployExplorerStep;
    relayStepStub = {asListrTask: sinon.stub().returns({title: 'relay-task'})} as unknown as DeployRelayStep;
    waitForStub = sinon.stub().resolves({deployment: 'test-deployment'});
    eventBusStub = {waitFor: waitForStub} as unknown as SoloEventBus;

    orchestrator = new DefaultOneShotDeployOrchestrator(
      eventBusStub,
      blockNodeStepStub,
      networkPipelineStepStub,
      mirrorNodeStepStub,
      explorerStepStub,
      relayStepStub,
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildDeployTaskList', (): void => {
    it('passes exactly 5 phase tasks to parentTask.newListr', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDeployContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>;
      const config: OneShotSingleDeployConfigClass = makeConfig();

      orchestrator.buildDeployTaskList(config, parentTaskStub);

      expect(newListrStub.calledOnce).to.be.true;
      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      expect(tasks).to.have.length(5);
    });

    it('passes concurrent: config.parallelDeploy to newListr options', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDeployContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>;

      orchestrator.buildDeployTaskList(makeConfig({parallelDeploy: true}), parentTaskStub);
      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(true);

      newListrStub.resetHistory();

      orchestrator.buildDeployTaskList(makeConfig({parallelDeploy: false}), parentTaskStub);
      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(false);
    });

    it('block, network, and mirror phases delegate their task directly from the step', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDeployContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>;
      const config: OneShotSingleDeployConfigClass = makeConfig();

      orchestrator.buildDeployTaskList(config, parentTaskStub);

      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      expect(tasks[0]).to.deep.equal({title: 'block-task'});
      expect(tasks[1]).to.deep.equal({title: 'network-task'});
      expect(tasks[2]).to.deep.equal({title: 'mirror-task'});
    });

    it('explorer phase wraps with a wait for MirrorNodeDeployed event', async (): Promise<void> => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDeployContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>;
      const config: OneShotSingleDeployConfigClass = makeConfig();

      orchestrator.buildDeployTaskList(config, parentTaskStub);

      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      type PhaseTaskShape = {
        task?: (
          context: OneShotSingleDeployContext,
          wrapper: SoloListrTaskWrapper<OneShotSingleDeployContext>,
        ) => Promise<unknown>;
      };
      const explorerTask: PhaseTaskShape = tasks[3] as PhaseTaskShape;
      expect(explorerTask).to.have.property('task').that.is.a('function');

      const innerNewListrStub: SinonStub = sinon.stub().returns([]);
      await explorerTask.task?.(
        {} as OneShotSingleDeployContext,
        {newListr: innerNewListrStub} as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>,
      );

      expect(waitForStub.calledOnce).to.be.true;
      expect(waitForStub.firstCall.args[0]).to.equal(SoloEventType.MirrorNodeDeployed);
    });

    it('relay phase wraps with waits for MirrorNodeDeployed then NodesStarted', async (): Promise<void> => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDeployContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>;
      const config: OneShotSingleDeployConfigClass = makeConfig();

      orchestrator.buildDeployTaskList(config, parentTaskStub);

      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      type PhaseTaskShape = {
        task?: (
          context: OneShotSingleDeployContext,
          wrapper: SoloListrTaskWrapper<OneShotSingleDeployContext>,
        ) => Promise<unknown>;
      };
      const relayTask: PhaseTaskShape = tasks[4] as PhaseTaskShape;
      expect(relayTask).to.have.property('task').that.is.a('function');

      const innerNewListrStub: SinonStub = sinon.stub().returns([]);
      await relayTask.task?.(
        {} as OneShotSingleDeployContext,
        {newListr: innerNewListrStub} as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>,
      );

      expect(waitForStub.calledTwice).to.be.true;
      expect(waitForStub.firstCall.args[0]).to.equal(SoloEventType.MirrorNodeDeployed);
      expect(waitForStub.secondCall.args[0]).to.equal(SoloEventType.NodesStarted);
    });
  });
});
