// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {DefaultOneShotDeployOrchestrator} from '../../../../../../src/commands/one-shot/orchestrator/deploy/default-one-shot-deploy-orchestrator.js';
import {type SoloEventBus} from '../../../../../../src/core/events/solo-event-bus.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-context.js';
import {type SoloListrTask} from '../../../../../../src/types/index.js';
import {type TaskList} from '../../../../../../src/core/task-list/task-list.js';
import {type AccountManager} from '../../../../../../src/core/account-manager.js';
import {type LocalConfigRuntimeState} from '../../../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type SoloLogger} from '../../../../../../src/core/logging/solo-logger.js';
import {type ConfigManager} from '../../../../../../src/core/config-manager.js';
import {type OneShotState} from '../../../../../../src/core/one-shot-state.js';
import {type K8Factory} from '../../../../../../src/integration/kube/k8-factory.js';
import {type LockManager} from '../../../../../../src/core/lock/lock-manager.js';
import {type ComponentFactoryApi} from '../../../../../../src/core/config/remote/api/component-factory-api.js';
import {type CommandFlags} from '../../../../../../src/types/flag-types.js';
import {type ArgvStruct} from '../../../../../../src/types/aliases.js';
import {type Lock} from '../../../../../../src/core/lock/lock.js';

describe('DefaultOneShotDeployOrchestrator', (): void => {
  let orchestrator: DefaultOneShotDeployOrchestrator;

  beforeEach((): void => {
    orchestrator = new DefaultOneShotDeployOrchestrator(
      {} as TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
      {waitFor: sinon.stub().resolves()} as unknown as SoloEventBus,
      {} as AccountManager,
      {} as LocalConfigRuntimeState,
      {} as RemoteConfigRuntimeStateApi,
      {} as SoloLogger,
      {} as ConfigManager,
      {} as OneShotState,
      {} as K8Factory,
      {} as LockManager,
      {} as ComponentFactoryApi,
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildDeployPipeline', (): void => {
    function buildTasks(): SoloListrTask<OneShotSingleDeployContext>[] {
      return orchestrator.buildDeployPipeline(
        {} as ArgvStruct,
        {required: [], optional: []} as CommandFlags,
        {} as {value?: Lock},
        {} as {value?: OneShotSingleDeployConfigClass},
      );
    }

    it('returns exactly 11 tasks', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      expect(tasks).to.have.length(11);
    });

    it('Initialize is first and has a task function', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      expect(tasks[0].title).to.equal('Initialize');
      expect(tasks[0].task).to.be.a('function');
    });

    it('Acquire deployment lock is second and has a task function', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      expect(tasks[1].title).to.equal('Acquire deployment lock');
      expect(tasks[1].task).to.be.a('function');
    });

    it('Check for other deployments skips when force is true', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      const skipFunction: ((context_: OneShotSingleDeployContext) => boolean) | undefined = tasks[2].skip as (
        context_: OneShotSingleDeployContext,
      ) => boolean;
      expect(skipFunction).to.be.a('function');
      expect(skipFunction({config: {force: true, quiet: false}} as OneShotSingleDeployContext)).to.be.true;
    });

    it('Check for other deployments skips when quiet is true', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      const skipFunction: ((context_: OneShotSingleDeployContext) => boolean) | undefined = tasks[2].skip as (
        context_: OneShotSingleDeployContext,
      ) => boolean;
      expect(skipFunction).to.be.a('function');
      expect(skipFunction({config: {force: false, quiet: true}} as OneShotSingleDeployContext)).to.be.true;
    });

    it('Check for other deployments does not skip when force and quiet are false', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      const skipFunction: ((context_: OneShotSingleDeployContext) => boolean) | undefined = tasks[2].skip as (
        context_: OneShotSingleDeployContext,
      ) => boolean;
      expect(skipFunction({config: {force: false, quiet: false}} as OneShotSingleDeployContext)).to.be.false;
    });

    it('setup invokeSoloCommand tasks are at indices 3-7 and each have a title and task', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      for (const index of [3, 4, 5, 6, 7]) {
        expect(tasks[index].title).to.be.a('string').and.not.be.empty;
        expect(tasks[index].task).to.be.a('function');
      }
    });

    it('Create remote config components is at index 8 and has a task function', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      expect(tasks[8].title).to.equal('Create remote config components');
      expect(tasks[8].task).to.be.a('function');
    });

    it('Deploy Solo components is at index 9 and has a task function', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      expect(tasks[9].title).to.equal('Deploy Solo components');
      expect(tasks[9].task).to.be.a('function');
    });

    it('Finish is last and has a task function', (): void => {
      const tasks: SoloListrTask<OneShotSingleDeployContext>[] = buildTasks();
      expect(tasks[10].title).to.equal('Finish');
      expect(tasks[10].task).to.be.a('function');
    });
  });
});
