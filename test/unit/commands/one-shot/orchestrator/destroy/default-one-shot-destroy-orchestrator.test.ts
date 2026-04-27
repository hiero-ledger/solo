// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {DefaultOneShotDestroyOrchestrator} from '../../../../../../src/commands/one-shot/orchestrator/destroy/default-one-shot-destroy-orchestrator.js';
import {type SoloEventBus} from '../../../../../../src/core/events/solo-event-bus.js';
import {type OneShotSingleDestroyConfigClass} from '../../../../../../src/commands/one-shot/one-shot-single-destroy-config-class.js';
import {type OneShotSingleDestroyContext} from '../../../../../../src/commands/one-shot/one-shot-single-destroy-context.js';
import {type SoloListrTaskWrapper} from '../../../../../../src/types/index.js';
import {NamespaceName} from '../../../../../../src/types/namespace/namespace-name.js';
import {type TaskList} from '../../../../../../src/core/task-list/task-list.js';

function makeConfig(overrides: Partial<OneShotSingleDestroyConfigClass> = {}): OneShotSingleDestroyConfigClass {
  return {
    deployment: 'test-deployment',
    namespace: NamespaceName.of('test-ns'),
    clusterRef: 'test-cluster',
    context: 'test-context',
    cacheDir: '/tmp/cache',
    skipAll: false,
    hasExplorers: true,
    hasRelays: true,
    hasMirrorNodes: true,
    hasBlockNodes: true,
    ...overrides,
  } as OneShotSingleDestroyConfigClass;
}

describe('DefaultOneShotDestroyOrchestrator', (): void => {
  let orchestrator: DefaultOneShotDestroyOrchestrator;
  let taskListStub: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;
  let eventBusStub: SoloEventBus;

  beforeEach((): void => {
    taskListStub = {} as TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;
    eventBusStub = {waitFor: sinon.stub()} as unknown as SoloEventBus;

    orchestrator = new DefaultOneShotDestroyOrchestrator(taskListStub, eventBusStub);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildDestroyTaskList', (): void => {
    it('passes exactly 7 phase tasks to parentTask.newListr', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      expect(newListrStub.calledOnce).to.be.true;
      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      expect(tasks).to.have.length(7);
    });

    it('passes concurrent: false to top-level newListr options', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(false);
    });

    it('first phase is a composite with a task function (Destroy extended setup)', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      expect(tasks[0]).to.have.property('task').that.is.a('function');
    });

    it('composite phase runs explorer and relay steps concurrently with exitOnError: false', (): void => {
      const outerNewListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: outerNewListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      const tasks: unknown[] = outerNewListrStub.firstCall.args[0] as unknown[];
      type PhaseTaskShape = {
        task?: (
          context: OneShotSingleDestroyContext,
          wrapper: SoloListrTaskWrapper<OneShotSingleDestroyContext>,
        ) => unknown;
      };
      const compositeTask: PhaseTaskShape = tasks[0] as PhaseTaskShape;

      const innerNewListrStub: SinonStub = sinon.stub().returns([]);
      compositeTask.task?.(
        {} as OneShotSingleDestroyContext,
        {newListr: innerNewListrStub} as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>,
      );

      expect(innerNewListrStub.calledOnce).to.be.true;
      const options: {concurrent: boolean; exitOnError: boolean} = innerNewListrStub.firstCall.args[1] as {
        concurrent: boolean;
        exitOnError: boolean;
      };
      expect(options.concurrent).to.equal(true);
      expect(options.exitOnError).to.equal(false);
    });

    it('mirror, block, consensus, reset, disconnect, and delete phases have titles and skip functions', (): void => {
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const parentTaskStub: SoloListrTaskWrapper<OneShotSingleDestroyContext> = {
        newListr: newListrStub,
      } as unknown as SoloListrTaskWrapper<OneShotSingleDestroyContext>;

      orchestrator.buildDestroyTaskList(makeConfig(), parentTaskStub);

      const tasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
      for (const taskIndex of [1, 2, 3, 4, 5, 6]) {
        const phaseTask: {title: string; skip: () => boolean} = tasks[taskIndex] as {
          title: string;
          skip: () => boolean;
        };
        expect(phaseTask.title).to.be.a('string').and.not.be.empty;
        expect(phaseTask.skip).to.be.a('function');
      }
    });
  });
});
