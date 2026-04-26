// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {DeployNetworkPipelineStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-network-pipeline-step.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {ConsensusCommandDefinition} from '../../../../../src/commands/command-definitions/consensus-command-definition.js';
import {NamespaceName} from '../../../../../src/types/namespace/namespace-name.js';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {type TaskList} from '../../../../../src/core/task-list/task-list.js';
import {type AccountManager} from '../../../../../src/core/account-manager.js';
import {type LocalConfigRuntimeState} from '../../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type SoloLogger} from '../../../../../src/core/logging/solo-logger.js';

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

describe('DeployNetworkPipelineStep', (): void => {
  let step: DeployNetworkPipelineStep;

  beforeEach((): void => {
    const taskListStub: TaskList<ListrContext, ListrRendererValue, ListrRendererValue> = {} as TaskList<
      ListrContext,
      ListrRendererValue,
      ListrRendererValue
    >;
    const accountManagerStub: AccountManager = {} as AccountManager;
    const localConfigStub: LocalConfigRuntimeState = {} as LocalConfigRuntimeState;
    const remoteConfigStub: RemoteConfigRuntimeStateApi = {} as RemoteConfigRuntimeStateApi;
    const loggerStub: SoloLogger = {} as SoloLogger;
    step = new DeployNetworkPipelineStep(
      taskListStub,
      accountManagerStub,
      localConfigStub,
      remoteConfigStub,
      loggerStub,
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildDeployArgv', (): void => {
    it('includes consensus deploy command tokens and --deployment flag', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildDeployArgv(config);
      for (const token of ConsensusCommandDefinition.DEPLOY_COMMAND.split(' ')) {
        expect(argv).to.include(token);
      }
      expect(argv).to.include('--deployment');
      expect(argv).to.include('test-deployment');
    });
  });

  describe('buildSetupArgv', (): void => {
    it('includes consensus setup command tokens and --deployment flag', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildSetupArgv(config);
      for (const token of ConsensusCommandDefinition.SETUP_COMMAND.split(' ')) {
        expect(argv).to.include(token);
      }
      expect(argv).to.include('--deployment');
      expect(argv).to.include('test-deployment');
    });
  });

  describe('buildStartArgv', (): void => {
    it('includes consensus start command tokens and --deployment flag', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildStartArgv(config);
      for (const token of ConsensusCommandDefinition.START_COMMAND.split(' ')) {
        expect(argv).to.include(token);
      }
      expect(argv).to.include('--deployment');
      expect(argv).to.include('test-deployment');
    });
  });

  describe('asListrTask', (): void => {
    it('returns a task object with a task function', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const task: ReturnType<typeof step.asListrTask> = step.asListrTask(config);
      expect(task).to.have.property('task').that.is.a('function');
    });

    it('returned task has no skip condition (always runs)', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const task: ReturnType<typeof step.asListrTask> = step.asListrTask(config);
      expect(task).to.not.have.property('skip');
    });
  });
});
