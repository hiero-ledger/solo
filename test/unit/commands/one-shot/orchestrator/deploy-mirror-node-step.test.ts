// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {DeployMirrorNodeStep} from '../../../../../src/commands/one-shot/orchestrator/deploy-mirror-node-step.js';
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

describe('DeployMirrorNodeStep', (): void => {
  let step: DeployMirrorNodeStep;
  let taskListStub: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;

  beforeEach((): void => {
    taskListStub = {} as TaskList<ListrContext, ListrRendererValue, ListrRendererValue>;
    step = new DeployMirrorNodeStep(taskListStub);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('buildArgv', (): void => {
    it('includes deployment flag, cluster-ref, pinger, enable-ingress', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig();
      const argv: string[] = step.buildArgv(config);
      expect(argv).to.include('--deployment');
      expect(argv).to.include('test-deployment');
      expect(argv).to.include('--cluster-ref');
      expect(argv).to.include('test-cluster');
      expect(argv).to.include('--pinger');
      expect(argv).to.include('--enable-ingress');
    });

    it('includes the parallel-deploy flag', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig({parallelDeploy: true});
      const argv: string[] = step.buildArgv(config);
      expect(argv).to.include('--parallel-deploy');
      expect(argv).to.include('true');
    });

    it('sets --values-file to MIRROR_NODE_HIKARI_LIMITS_FILE when no existing values file', (): void => {
      const config: OneShotSingleDeployConfigClass = makeConfig({mirrorNodeConfiguration: {}});
      const argv: string[] = step.buildArgv(config);
      const valueIndex: number = argv.indexOf('--values-file');
      expect(valueIndex).to.be.greaterThan(-1);
      expect(argv[valueIndex + 1]).to.equal(constants.MIRROR_NODE_HIKARI_LIMITS_FILE);
    });

    it('appends MIRROR_NODE_HIKARI_LIMITS_FILE to an existing values file', (): void => {
      const existingFile: string = '/path/to/custom.yaml';
      const config: OneShotSingleDeployConfigClass = makeConfig({
        mirrorNodeConfiguration: {'--values-file': existingFile},
      });
      const argv: string[] = step.buildArgv(config);
      const valueIndex: number = argv.indexOf('--values-file');
      expect(valueIndex).to.be.greaterThan(-1);
      expect(argv[valueIndex + 1]).to.equal(`${existingFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`);
    });

    it('does not mutate mirrorNodeConfiguration', (): void => {
      const originalFile: string = '/original.yaml';
      const mirrorNodeConfiguration: Record<string, string> = {'--values-file': originalFile};
      const config: OneShotSingleDeployConfigClass = makeConfig({mirrorNodeConfiguration});
      step.buildArgv(config);
      expect(mirrorNodeConfiguration['--values-file']).to.equal(originalFile);
    });
  });
});
