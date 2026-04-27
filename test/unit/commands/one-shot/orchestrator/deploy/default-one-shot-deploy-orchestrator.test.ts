// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {DefaultOneShotDeployOrchestrator} from '../../../../../../src/commands/one-shot/orchestrator/deploy/default-one-shot-deploy-orchestrator.js';
import {type SoloEventBus} from '../../../../../../src/core/events/solo-event-bus.js';
import {SoloEventType} from '../../../../../../src/core/events/event-types/event-types.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-context.js';
import {type SoloListrTaskWrapper} from '../../../../../../src/types/index.js';
import {NamespaceName} from '../../../../../../src/types/namespace/namespace-name.js';
import {type TaskList} from '../../../../../../src/core/task-list/task-list.js';
import {type AccountManager} from '../../../../../../src/core/account-manager.js';
import {type LocalConfigRuntimeState} from '../../../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type SoloLogger} from '../../../../../../src/core/logging/solo-logger.js';

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
    cacheDir: '/tmp/cache',
    ...overrides,
  } as OneShotSingleDeployConfigClass;
}

describe('DefaultOneShotDeployOrchestrator', (): void => {
  let orchestrator: DefaultOneShotDeployOrchestrator;
  let taskListStub: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;
  let eventBusStub: SoloEventBus;
  let waitForStub: SinonStub;

  beforeEach((): void => {
    taskListStub = {} as TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;
    waitForStub = sinon.stub().resolves({deployment: 'test-deployment'});
    eventBusStub = {waitFor: waitForStub} as unknown as SoloEventBus;

    orchestrator = new DefaultOneShotDeployOrchestrator(
      taskListStub,
      eventBusStub,
      {} as AccountManager,
      {} as LocalConfigRuntimeState,
      {} as RemoteConfigRuntimeStateApi,
      {} as SoloLogger,
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

      orchestrator.buildDeployTaskList(makeConfig(), parentTaskStub);

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

    it('block node and mirror node phases have a title and skip function', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDeployContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>;

      orchestrator.buildDeployTaskList(makeConfig(), parentTaskStub);

      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      const blockTask: {title: string; skip: () => boolean} = tasks[0] as {title: string; skip: () => boolean};
      const mirrorTask: {title: string; skip: () => boolean} = tasks[2] as {title: string; skip: () => boolean};
      expect(blockTask.title).to.be.a('string').and.not.be.empty;
      expect(blockTask.skip).to.be.a('function');
      expect(mirrorTask.title).to.be.a('string').and.not.be.empty;
      expect(mirrorTask.skip).to.be.a('function');
    });

    it('network node phase is a composite with title "Deploy network node" and a task function', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDeployContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>;

      orchestrator.buildDeployTaskList(makeConfig(), parentTaskStub);

      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      const networkTask: {title: string; task: () => unknown} = tasks[1] as {title: string; task: () => unknown};
      expect(networkTask.title).to.equal('Deploy network node');
      expect(networkTask.task).to.be.a('function');
    });

    it('explorer phase wraps with a wait for MirrorNodeDeployed event', async (): Promise<void> => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDeployContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDeployContext>;

      orchestrator.buildDeployTaskList(makeConfig(), parentTaskStub);

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

      orchestrator.buildDeployTaskList(makeConfig(), parentTaskStub);

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
