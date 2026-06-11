// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import {DefaultOneShotDeployOrchestrator} from '../../../../../../src/commands/one-shot/orchestrator/deploy/default-one-shot-deploy-orchestrator.js';
import {NamespaceName} from '../../../../../../src/types/namespace/namespace-name.js';
import {SoloError} from '../../../../../../src/core/errors/solo-error.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {type DeploymentStateSnapshot} from '../../../../../../src/commands/one-shot/deployment-state-snapshot.js';

type MockType = any;
type MockListr = MockType;

function makeOrchestrator(
  overrides: {
    localConfig?: MockType;
    remoteConfig?: MockType;
    helm?: MockType;
  } = {},
): DefaultOneShotDeployOrchestrator {
  return new DefaultOneShotDeployOrchestrator(
    {} as MockType,
    {} as MockType,
    {} as MockType,
    overrides.localConfig ?? ({} as MockType),
    overrides.remoteConfig ?? ({} as MockType),
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    overrides.helm ?? ({} as MockType),
  );
}

function makeConfig(overrides: Partial<OneShotSingleDeployConfigClass> = {}): OneShotSingleDeployConfigClass {
  return {
    relayNodeConfiguration: {},
    explorerNodeConfiguration: {},
    blockNodeConfiguration: {},
    mirrorNodeConfiguration: {},
    consensusNodeConfiguration: {},
    networkConfiguration: {},
    setupConfiguration: {},
    valuesFile: '',
    clusterRef: 'one-shot',
    context: 'kind-solo',
    deployment: 'one-shot',
    namespace: NamespaceName.of('one-shot'),
    numberOfConsensusNodes: 1,
    cacheDir: '/tmp/cache',
    predefinedAccounts: true,
    minimalSetup: false,
    deployMirrorNode: true,
    deployExplorer: true,
    deployRelay: true,
    deployMetricsServer: false,
    force: false,
    quiet: false,
    rollback: true,
    parallelDeploy: false,
    externalAddress: '',
    edgeEnabled: false,
    versions: {
      soloChart: '',
      consensus: '',
      mirror: '',
      explorer: '',
      relay: '',
      blockNode: '',
    },
    argv: {_: []},
    ...overrides,
  };
}

function makeTaskWrapper(promptResult: boolean): MockListr {
  const runStub: sinon.SinonStub = sinon.stub().resolves(promptResult);
  const promptAdapterStub: sinon.SinonStub = sinon.stub().returns({run: runStub});

  return {
    prompt: promptAdapterStub,
  };
}

describe('DefaultOneShotDeployOrchestrator non-Kind context guard', (): void => {
  describe('isKindContext', (): void => {
    it('returns true when the context is a Kind context', (): void => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();

      // @ts-expect-error - to access private method
      expect(orchestrator.isKindContext('kind-solo')).to.be.true;
      // @ts-expect-error - to access private method
      expect(orchestrator.isKindContext('kind-one-shot')).to.be.true;
      // @ts-expect-error - to access private method
      expect(orchestrator.isKindContext('kind-local-cluster')).to.be.true;
    });

    it('returns false when the context is not a Kind context', (): void => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();

      // @ts-expect-error - to access private method
      expect(orchestrator.isKindContext('gke_mirrornode-non-prod-314918_us-central1_mainnet-staging-na')).to.be.false;
      // @ts-expect-error - to access private method
      expect(orchestrator.isKindContext('docker-desktop')).to.be.false;
      // @ts-expect-error - to access private method
      expect(orchestrator.isKindContext('minikube')).to.be.false;
      // @ts-expect-error - to access private method
      expect(orchestrator.isKindContext('arn:aws:eks:us-east-1:123456789012:cluster/prod')).to.be.false;
    });
  });

  describe('buildNonKindContextWarningMessage', (): void => {
    it('includes the active context and warning details', (): void => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();

      // @ts-expect-error - to access private method
      const message: string = orchestrator.buildNonKindContextWarningMessage('gke-prod');

      expect(message).to.include("Active Kubernetes context 'gke-prod'");
      expect(message).to.include('not a local Kind cluster');
      expect(message).to.include('one-shot deploy is intended for local development');
      expect(message).to.include('Solo charts, CRDs, namespaces, and other resources');
      expect(message).to.include('Continue?');
    });
  });

  describe('confirmNonKindContext', (): void => {
    it('does not prompt when quiet mode is enabled', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(false);

      // @ts-expect-error - to access private method
      await orchestrator.confirmNonKindContext(
        makeConfig({
          context: 'gke-prod',
          quiet: true,
        }),
        task,
      );

      expect(task.prompt).to.not.have.been.called;
    });

    it('does not prompt when the context is a Kind context', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(false);

      // @ts-expect-error - to access private method
      await orchestrator.confirmNonKindContext(
        makeConfig({
          context: 'kind-solo',
          quiet: false,
        }),
        task,
      );

      expect(task.prompt).to.not.have.been.called;
    });

    it('prompts when the context is not a Kind context', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(true);

      // @ts-expect-error - to access private method
      await orchestrator.confirmNonKindContext(
        makeConfig({
          context: 'gke-prod',
          quiet: false,
        }),
        task,
      );

      expect(task.prompt).to.have.been.calledOnce;
    });

    it('continues when the user confirms deployment to a non-Kind context', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(true);

      // @ts-expect-error - to access private method
      await orchestrator.confirmNonKindContext(
        makeConfig({
          context: 'gke-prod',
          quiet: false,
        }),
        task,
      );
    });

    it('throws when the user rejects deployment to a non-Kind context', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(false);

      try {
        // @ts-expect-error - to access private method
        await orchestrator.confirmNonKindContext(
          makeConfig({
            context: 'gke-prod',
            quiet: false,
          }),
          task,
        );

        expect.fail('Expected confirmNonKindContext to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
        expect((error as Error).message).to.equal('Aborted by user');
      }
    });
  });
});

describe('DefaultOneShotDeployOrchestrator buildDeploymentStateSnapshot', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('returns conservative defaults when remoteConfig.load() throws', async (): Promise<void> => {
    const remoteConfigMock: MockType = {
      load: sinon.stub().rejects(new Error('K8s unreachable')),
      isLoaded: sinon.stub().returns(false),
      getComponentPhasesMap: sinon.stub().returns(new Map()),
    };
    const localConfigMock: MockType = {
      isLoaded: false,
    };
    const helmMock: MockType = {
      listReleases: sinon.stub().resolves([]),
    };
    const loggerMock: MockType = {
      info: sinon.stub(),
      debug: sinon.stub(),
    };
    const orchestrator: DefaultOneShotDeployOrchestrator = new DefaultOneShotDeployOrchestrator(
      {} as MockType,
      {} as MockType,
      {} as MockType,
      localConfigMock,
      remoteConfigMock,
      loggerMock,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      helmMock,
    );

    // @ts-expect-error - to access private method
    const snapshot: DeploymentStateSnapshot = await orchestrator.buildDeploymentStateSnapshot(makeConfig());

    expect(snapshot.remoteConfig.configMapExists).to.be.false;
    expect(snapshot.remoteConfig.componentPhases.size).to.equal(0);
  });

  it('returns conservative defaults when helm.listReleases() throws', async (): Promise<void> => {
    const remoteConfigMock: MockType = {
      load: sinon.stub().rejects(new Error('ConfigMap not found')),
      isLoaded: sinon.stub().returns(false),
      getComponentPhasesMap: sinon.stub().returns(new Map()),
    };
    const localConfigMock: MockType = {
      isLoaded: false,
    };
    const helmMock: MockType = {
      listReleases: sinon.stub().rejects(new Error('Helm unavailable')),
    };
    const loggerMock: MockType = {
      info: sinon.stub(),
      debug: sinon.stub(),
    };
    const orchestrator: DefaultOneShotDeployOrchestrator = new DefaultOneShotDeployOrchestrator(
      {} as MockType,
      {} as MockType,
      {} as MockType,
      localConfigMock,
      remoteConfigMock,
      loggerMock,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      helmMock,
    );

    // @ts-expect-error - to access private method
    const snapshot: DeploymentStateSnapshot = await orchestrator.buildDeploymentStateSnapshot(makeConfig());

    expect(snapshot.helm.installedReleases.size).to.equal(0);
  });

  it('populates installedReleases from helm when available', async (): Promise<void> => {
    const remoteConfigMock: MockType = {
      load: sinon.stub().rejects(new Error('no config')),
      isLoaded: sinon.stub().returns(false),
      getComponentPhasesMap: sinon.stub().returns(new Map()),
    };
    const localConfigMock: MockType = {
      isLoaded: false,
    };
    const helmMock: MockType = {
      listReleases: sinon.stub().resolves([
        {
          name: 'solo-deployment',
          namespace: 'one-shot',
          revision: '1',
          updated: '',
          status: 'deployed',
          chart: '',
          app_version: '',
        },
        {
          name: 'solo-cluster-setup',
          namespace: 'one-shot',
          revision: '1',
          updated: '',
          status: 'deployed',
          chart: '',
          app_version: '',
        },
      ]),
    };
    const loggerMock: MockType = {
      info: sinon.stub(),
      debug: sinon.stub(),
    };
    const orchestrator: DefaultOneShotDeployOrchestrator = new DefaultOneShotDeployOrchestrator(
      {} as MockType,
      {} as MockType,
      {} as MockType,
      localConfigMock,
      remoteConfigMock,
      loggerMock,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      helmMock,
    );

    // @ts-expect-error - to access private method
    const snapshot: DeploymentStateSnapshot = await orchestrator.buildDeploymentStateSnapshot(makeConfig());

    expect(snapshot.helm.installedReleases.has('solo-deployment')).to.be.true;
    expect(snapshot.helm.installedReleases.has('solo-cluster-setup')).to.be.true;
  });

  it('sets cluster.podMonitorRoleExists to true when the ClusterRole exists', async (): Promise<void> => {
    const remoteConfigMock: MockType = {
      load: sinon.stub().rejects(new Error('no config')),
      isLoaded: sinon.stub().returns(false),
      getComponentPhasesMap: sinon.stub().returns(new Map()),
    };
    const localConfigMock: MockType = {
      isLoaded: false,
    };
    const helmMock: MockType = {
      listReleases: sinon.stub().resolves([]),
    };
    const loggerMock: MockType = {
      info: sinon.stub(),
      debug: sinon.stub(),
    };
    const k8FactoryMock: MockType = {
      getK8: sinon.stub().returns({
        rbac: sinon.stub().returns({
          clusterRoleExists: sinon.stub().resolves(true),
        }),
      }),
    };
    const orchestrator: DefaultOneShotDeployOrchestrator = new DefaultOneShotDeployOrchestrator(
      {} as MockType,
      {} as MockType,
      {} as MockType,
      localConfigMock,
      remoteConfigMock,
      loggerMock,
      {} as MockType,
      {} as MockType,
      k8FactoryMock,
      {} as MockType,
      {} as MockType,
      helmMock,
    );

    // @ts-expect-error - to access private method
    const snapshot: DeploymentStateSnapshot = await orchestrator.buildDeploymentStateSnapshot(makeConfig());

    expect(snapshot.cluster.podMonitorRoleExists).to.be.true;
  });

  it('sets cluster.podMonitorRoleExists to false when the ClusterRole does not exist', async (): Promise<void> => {
    const remoteConfigMock: MockType = {
      load: sinon.stub().rejects(new Error('no config')),
      isLoaded: sinon.stub().returns(false),
      getComponentPhasesMap: sinon.stub().returns(new Map()),
    };
    const localConfigMock: MockType = {
      isLoaded: false,
    };
    const helmMock: MockType = {
      listReleases: sinon.stub().resolves([]),
    };
    const loggerMock: MockType = {
      info: sinon.stub(),
      debug: sinon.stub(),
    };
    const k8FactoryMock: MockType = {
      getK8: sinon.stub().returns({
        rbac: sinon.stub().returns({
          clusterRoleExists: sinon.stub().resolves(false),
        }),
      }),
    };
    const orchestrator: DefaultOneShotDeployOrchestrator = new DefaultOneShotDeployOrchestrator(
      {} as MockType,
      {} as MockType,
      {} as MockType,
      localConfigMock,
      remoteConfigMock,
      loggerMock,
      {} as MockType,
      {} as MockType,
      k8FactoryMock,
      {} as MockType,
      {} as MockType,
      helmMock,
    );

    // @ts-expect-error - to access private method
    const snapshot: DeploymentStateSnapshot = await orchestrator.buildDeploymentStateSnapshot(makeConfig());

    expect(snapshot.cluster.podMonitorRoleExists).to.be.false;
  });

  it('defaults cluster.podMonitorRoleExists to false when k8Factory is unavailable', async (): Promise<void> => {
    const remoteConfigMock: MockType = {
      load: sinon.stub().rejects(new Error('no config')),
      isLoaded: sinon.stub().returns(false),
      getComponentPhasesMap: sinon.stub().returns(new Map()),
    };
    const localConfigMock: MockType = {
      isLoaded: false,
    };
    const helmMock: MockType = {
      listReleases: sinon.stub().resolves([]),
    };
    const loggerMock: MockType = {
      info: sinon.stub(),
      debug: sinon.stub(),
    };
    const orchestrator: DefaultOneShotDeployOrchestrator = new DefaultOneShotDeployOrchestrator(
      {} as MockType,
      {} as MockType,
      {} as MockType,
      localConfigMock,
      remoteConfigMock,
      loggerMock,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      helmMock,
    );

    // @ts-expect-error - to access private method
    const snapshot: DeploymentStateSnapshot = await orchestrator.buildDeploymentStateSnapshot(makeConfig());

    expect(snapshot.cluster.podMonitorRoleExists).to.be.false;
  });
});

describe('DefaultOneShotDeployOrchestrator idempotency skip guards', (): void => {
  const CLUSTER_CONNECT_TASK_INDEX: number = 6;
  const DEPLOYMENT_CREATE_TASK_INDEX: number = 7;
  const DEPLOYMENT_ATTACH_TASK_INDEX: number = 8;
  const CLUSTER_SETUP_TASK_INDEX: number = 9;
  const KEYS_GENERATE_TASK_INDEX: number = 10;

  function makeMinimalOrchestrator(): DefaultOneShotDeployOrchestrator {
    return new DefaultOneShotDeployOrchestrator(
      {} as MockType,
      {emit: sinon.stub(), waitFor: sinon.stub()} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {info: sinon.stub()} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
      {} as MockType,
    );
  }

  function makeSnapshot(overrides: Partial<DeploymentStateSnapshot> = {}): DeploymentStateSnapshot {
    return {
      localConfig: {deploymentExists: false, clusterRefs: new Set()},
      remoteConfig: {configMapExists: false, componentPhases: new Map()},
      helm: {installedReleases: new Set()},
      keys: {consensusKeysOnDisk: false},
      accounts: {accountsFileExists: false},
      cluster: {podMonitorRoleExists: false},
      ...overrides,
    };
  }

  function buildPipelineTasks(orchestrator: DefaultOneShotDeployOrchestrator): MockType[] {
    const pipeline = orchestrator.buildDeployPipeline(
      {_: []} as MockType,
      {required: [], optional: []} as MockType,
      {} as MockType,
      {} as MockType,
    );
    return pipeline.tasks as MockType[];
  }

  it('cluster connect: does not skip when snapshot is absent', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {config: makeConfig(), deploymentStateSnapshot: undefined};

    expect(tasks[CLUSTER_CONNECT_TASK_INDEX].skip(context_)).to.be.false;
  });

  it('cluster connect: skips when clusterRef is already in local config', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig({clusterRef: 'one-shot'}),
      deploymentStateSnapshot: makeSnapshot({
        localConfig: {deploymentExists: true, clusterRefs: new Set(['one-shot'])},
      }),
    };

    expect(tasks[CLUSTER_CONNECT_TASK_INDEX].skip(context_)).to.be.true;
  });

  it('cluster connect: does not skip when clusterRef is not in local config', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig({clusterRef: 'one-shot'}),
      deploymentStateSnapshot: makeSnapshot({
        localConfig: {deploymentExists: false, clusterRefs: new Set()},
      }),
    };

    expect(tasks[CLUSTER_CONNECT_TASK_INDEX].skip(context_)).to.be.false;
  });

  it('deployment create: does not skip when snapshot is absent', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {config: makeConfig(), deploymentStateSnapshot: undefined};

    expect(tasks[DEPLOYMENT_CREATE_TASK_INDEX].skip(context_)).to.be.false;
  });

  it('deployment create: skips when deployment already exists in local config', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig(),
      deploymentStateSnapshot: makeSnapshot({
        localConfig: {deploymentExists: true, clusterRefs: new Set()},
      }),
    };

    expect(tasks[DEPLOYMENT_CREATE_TASK_INDEX].skip(context_)).to.be.true;
  });

  it('deployment create: does not skip when deployment does not exist', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig(),
      deploymentStateSnapshot: makeSnapshot({
        localConfig: {deploymentExists: false, clusterRefs: new Set()},
      }),
    };

    expect(tasks[DEPLOYMENT_CREATE_TASK_INDEX].skip(context_)).to.be.false;
  });

  it('deployment attach: does not skip when snapshot is absent', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {config: makeConfig(), deploymentStateSnapshot: undefined};

    expect(tasks[DEPLOYMENT_ATTACH_TASK_INDEX].skip(context_)).to.be.false;
  });

  it('deployment attach: skips when remote config already exists', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig(),
      deploymentStateSnapshot: makeSnapshot({
        remoteConfig: {configMapExists: true, componentPhases: new Map()},
      }),
    };

    expect(tasks[DEPLOYMENT_ATTACH_TASK_INDEX].skip(context_)).to.be.true;
  });

  it('deployment attach: does not skip when remote config is absent', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig(),
      deploymentStateSnapshot: makeSnapshot({
        remoteConfig: {configMapExists: false, componentPhases: new Map()},
      }),
    };

    expect(tasks[DEPLOYMENT_ATTACH_TASK_INDEX].skip(context_)).to.be.false;
  });

  it('cluster setup: does not skip when snapshot is absent', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {config: makeConfig(), deploymentStateSnapshot: undefined};

    expect(tasks[CLUSTER_SETUP_TASK_INDEX].skip(context_)).to.be.false;
  });

  it('cluster setup: skips when pod-monitor-role already exists', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig(),
      deploymentStateSnapshot: makeSnapshot({cluster: {podMonitorRoleExists: true}}),
    };

    expect(tasks[CLUSTER_SETUP_TASK_INDEX].skip(context_)).to.be.true;
  });

  it('cluster setup: does not skip when pod-monitor-role is absent', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig(),
      deploymentStateSnapshot: makeSnapshot({cluster: {podMonitorRoleExists: false}}),
    };

    expect(tasks[CLUSTER_SETUP_TASK_INDEX].skip(context_)).to.be.false;
  });

  it('keys generate: does not skip when snapshot is absent', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {config: makeConfig(), deploymentStateSnapshot: undefined};

    expect(tasks[KEYS_GENERATE_TASK_INDEX].skip(context_)).to.be.false;
  });

  it('keys generate: skips when consensus keys are already on disk', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig(),
      deploymentStateSnapshot: makeSnapshot({keys: {consensusKeysOnDisk: true}}),
    };

    expect(tasks[KEYS_GENERATE_TASK_INDEX].skip(context_)).to.be.true;
  });

  it('keys generate: does not skip when keys are absent', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
    const tasks: MockType[] = buildPipelineTasks(orchestrator);
    const context_: MockType = {
      config: makeConfig(),
      deploymentStateSnapshot: makeSnapshot({keys: {consensusKeysOnDisk: false}}),
    };

    expect(tasks[KEYS_GENERATE_TASK_INDEX].skip(context_)).to.be.false;
  });
});
