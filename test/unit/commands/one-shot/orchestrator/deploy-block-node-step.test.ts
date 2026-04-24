// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {DeployBlockNodeStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-block-node-step.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import * as constants from '../../../../../src/core/constants.js';
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

describe('DeployBlockNodeStep', (): void => {
  let step: DeployBlockNodeStep;
  let taskListStub: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;

  beforeEach((): void => {
    taskListStub = {} as TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;
    step = new DeployBlockNodeStep(taskListStub);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildArgv', (): void => {
    it('includes the deployment flag and value', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildArgv(config);
      expect(argv).to.include('--deployment');
      expect(argv).to.include('test-deployment');
    });

    it('sets --values-file to BLOCK_NODE_SOLO_DEV_FILE when no existing values file', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig({blockNodeConfiguration: {}});
      const argv: string[] = step.buildArgv(config);
      const valueIndex: number = argv.indexOf('--values-file');
      expect(valueIndex).to.be.greaterThan(-1);
      expect(argv[valueIndex + 1]).to.equal(constants.BLOCK_NODE_SOLO_DEV_FILE);
    });

    it('appends BLOCK_NODE_SOLO_DEV_FILE to an existing values file', (): void => {
      const existingFile: string = '/some/path/values.yaml';
      const config: OneShotSingleDeployConfigClass = makeConfig({
        blockNodeConfiguration: {'--values-file': existingFile},
      });
      const argv: string[] = step.buildArgv(config);
      const valueIndex: number = argv.indexOf('--values-file');
      expect(valueIndex).to.be.greaterThan(-1);
      expect(argv[valueIndex + 1]).to.equal(`${existingFile},${constants.BLOCK_NODE_SOLO_DEV_FILE}`);
    });

    it('does not mutate blockNodeConfiguration', (): void => {
      const originalFile: string = '/original.yaml';
      const blockNodeConfiguration: Record<string, string> = {'--values-file': originalFile};
      const config: OneShotSingleDeployConfigClass = makeConfig({blockNodeConfiguration});
      step.buildArgv(config);
      expect(blockNodeConfiguration['--values-file']).to.equal(originalFile);
    });
  });

  describe('asListrTask', (): void => {
    it('returns a task with a non-empty title', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const task: ReturnType<typeof step.asListrTask> = step.asListrTask(config);
      expect(task.title).to.be.a('string').and.not.be.empty;
    });
  });
});
