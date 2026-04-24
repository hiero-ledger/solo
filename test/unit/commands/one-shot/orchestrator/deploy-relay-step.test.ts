// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {DeployRelayStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-relay-step.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {NamespaceName} from '../../../../../src/types/namespace/namespace-name.js';
import {type ListrContext, type ListrRendererValue} from 'listr2';
import {type TaskList} from '../../../../../src/core/task-list/task-list.js';

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

describe('DeployRelayStep', (): void => {
  let step: DeployRelayStep;
  let taskListStub: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;

  beforeEach((): void => {
    taskListStub = {} as TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;
    step = new DeployRelayStep(taskListStub);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildArgv', (): void => {
    it('includes deployment, cluster-ref, and hardcoded node1 alias', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildArgv(config);
      expect(argv).to.include('--deployment');
      expect(argv).to.include('test-deployment');
      expect(argv).to.include('--cluster-ref');
      expect(argv).to.include('test-cluster');
      expect(argv).to.include('--node-aliases');
      expect(argv).to.include('node1');
    });

    it('includes --mirror-node-id set to 1', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildArgv(config);
      expect(argv).to.include('--mirror-node-id');
      const idIndex: number = argv.indexOf('--mirror-node-id');
      expect(argv[idIndex + 1]).to.equal('1');
    });

    it('includes --mirror-namespace set to namespace name', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildArgv(config);
      expect(argv).to.include('--mirror-namespace');
      const namespaceIndex: number = argv.indexOf('--mirror-namespace');
      expect(argv[namespaceIndex + 1]).to.equal('test-ns');
    });
  });
});
