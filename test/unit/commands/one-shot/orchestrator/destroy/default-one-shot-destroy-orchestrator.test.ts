// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {DefaultOneShotDestroyOrchestrator} from '../../../../../../src/commands/one-shot/orchestrator/destroy/default-one-shot-destroy-orchestrator.js';
import {type SoloEventBus} from '../../../../../../src/core/events/solo-event-bus.js';
import {type OneShotSingleDestroyContext} from '../../../../../../src/commands/one-shot/one-shot-single-destroy-context.js';
import {type SoloListrTask} from '../../../../../../src/types/index.js';
import {type TaskList} from '../../../../../../src/core/task-list/task-list.js';
import {type ConfigManager} from '../../../../../../src/core/config-manager.js';
import {type OneShotState} from '../../../../../../src/core/one-shot-state.js';
import {type K8Factory} from '../../../../../../src/integration/kube/k8-factory.js';
import {type LockManager} from '../../../../../../src/core/lock/lock-manager.js';
import {type LocalConfigRuntimeState} from '../../../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type SoloLogger} from '../../../../../../src/core/logging/solo-logger.js';
import {type CommandFlags} from '../../../../../../src/types/flag-types.js';
import {type ArgvStruct} from '../../../../../../src/types/aliases.js';
import {type Lock} from '../../../../../../src/core/lock/lock.js';

describe('DefaultOneShotDestroyOrchestrator', (): void => {
  let orchestrator: DefaultOneShotDestroyOrchestrator;

  beforeEach((): void => {
    orchestrator = new DefaultOneShotDestroyOrchestrator(
      {} as TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
      {waitFor: sinon.stub().resolves()} as unknown as SoloEventBus,
      {} as ConfigManager,
      {} as OneShotState,
      {} as K8Factory,
      {} as LockManager,
      {} as LocalConfigRuntimeState,
      {} as RemoteConfigRuntimeStateApi,
      {} as SoloLogger,
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildDestroyPipeline', (): void => {
    function buildTasks(): SoloListrTask<OneShotSingleDestroyContext>[] {
      return orchestrator.buildDestroyPipeline(
        {} as ArgvStruct,
        {required: [], optional: []} as CommandFlags,
        {} as {value?: Lock},
      );
    }

    it('returns exactly 3 tasks', (): void => {
      const tasks: SoloListrTask<OneShotSingleDestroyContext>[] = buildTasks();
      expect(tasks).to.have.length(3);
    });

    it('Initialize is first and has a task function', (): void => {
      const tasks: SoloListrTask<OneShotSingleDestroyContext>[] = buildTasks();
      expect(tasks[0].title).to.equal('Initialize');
      expect(tasks[0].task).to.be.a('function');
    });

    it('Acquire deployment lock is second and has a task function and skip function', (): void => {
      const tasks: SoloListrTask<OneShotSingleDestroyContext>[] = buildTasks();
      expect(tasks[1].title).to.equal('Acquire deployment lock');
      expect(tasks[1].task).to.be.a('function');
      expect(tasks[1].skip).to.be.a('function');
    });

    it('Destroy is third and has a task function and skip function', (): void => {
      const tasks: SoloListrTask<OneShotSingleDestroyContext>[] = buildTasks();
      expect(tasks[2].title).to.equal('Destroy');
      expect(tasks[2].task).to.be.a('function');
      expect(tasks[2].skip).to.be.a('function');
    });
  });
});
