// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {DeployExplorerStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-explorer-step.js';
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
    versions: {explorer: '2.5.0', soloChart: '', consensus: '', mirror: '', relay: '', blockNode: ''},
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

describe('DeployExplorerStep', (): void => {
  let step: DeployExplorerStep;
  let taskListStub: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;

  beforeEach((): void => {
    taskListStub = {} as TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;
    step = new DeployExplorerStep(taskListStub);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildArgv', (): void => {
    it('includes deployment and cluster-ref flags', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildArgv(config);
      expect(argv).to.include('--deployment');
      expect(argv).to.include('test-deployment');
      expect(argv).to.include('--cluster-ref');
      expect(argv).to.include('test-cluster');
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

    it('includes --explorer-version set to config versions.explorer', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildArgv(config);
      expect(argv).to.include('--explorer-version');
      const versionIndex: number = argv.indexOf('--explorer-version');
      expect(argv[versionIndex + 1]).to.equal('2.5.0');
    });
  });
});
