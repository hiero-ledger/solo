// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import {DefaultOneShotDeployOrchestrator} from '../../../../../../src/commands/one-shot/orchestrator/deploy/default-one-shot-deploy-orchestrator.js';
import {NamespaceName} from '../../../../../../src/types/namespace/namespace-name.js';
import {SoloError} from '../../../../../../src/core/errors/solo-error.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {type DeploymentStateSnapshot} from '../../../../../../src/commands/one-shot/deployment-state-snapshot.js';
import {type OneShotSingleDeployContext} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-context.js';
import {type OrchestratorPipeline} from '../../../../../../src/commands/one-shot/orchestrator/orchestrator-pipeline.js';
import {ComponentTypes} from '../../../../../../src/core/config/remote/enumerations/component-types.js';
import {DeploymentPhase} from '../../../../../../src/data/schema/model/remote/deployment-phase.js';
import {ConfirmationRequiredSoloError} from '../../../../../../src/core/errors/classes/validation/confirmation-required-solo-error.js';
import {UserBreak} from '../../../../../../src/core/errors/user-break.js';

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
    {} as MockType,
    {} as MockType,
    {} as MockType,
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
    pinger: true,
    externalAddress: '',
    edgeEnabled: false,
    clusterHasOneShotPortMappings: true,
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
      {} as MockType,
      {} as MockType,
      {} as MockType,
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
      {} as MockType,
      {} as MockType,
      {} as MockType,
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
      {} as MockType,
      {} as MockType,
      {} as MockType,
    );

    // @ts-expect-error - to access private method
    const snapshot: DeploymentStateSnapshot = await orchestrator.buildDeploymentStateSnapshot(makeConfig());

    expect(snapshot.helm.installedReleases.has('solo-deployment')).to.be.true;
    expect(snapshot.helm.installedReleases.has('solo-cluster-setup')).to.be.true;
  });
});

function createAccountsSkip(config: OneShotSingleDeployConfigClass): boolean {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
  // @ts-expect-error - to access private method
  const task: {skip: () => boolean} = orchestrator.buildCreateAccountsTask(config);
  return task.skip();
}

describe('DefaultOneShotDeployOrchestrator Create Accounts skip guard', (): void => {
  it('skips when predefined accounts are disabled', (): void => {
    expect(createAccountsSkip(makeConfig({predefinedAccounts: false}))).to.be.true;
  });

  it('runs when predefined accounts are enabled', (): void => {
    expect(createAccountsSkip(makeConfig({predefinedAccounts: true}))).to.be.false;
  });
});

function makeSnapshot(overrides: Partial<DeploymentStateSnapshot> = {}): DeploymentStateSnapshot {
  return {
    remoteConfig: {configMapExists: false, componentPhases: new Map<ComponentTypes, DeploymentPhase>()},
    helm: {installedReleases: new Set<string>()},
    accounts: {accountsFileExists: false},
    ...overrides,
  };
}

function invokeHasExistingOneShotState(snapshot: DeploymentStateSnapshot | undefined): boolean {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
  // @ts-expect-error - to access private method
  return orchestrator.hasExistingOneShotState(snapshot);
}

function invokeAutoCleanConfirmationMessage(snapshot: DeploymentStateSnapshot | undefined): string {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
  // @ts-expect-error - to access private method
  return orchestrator.buildAutoCleanConfirmationMessage(snapshot);
}

describe('DefaultOneShotDeployOrchestrator hasExistingOneShotState', (): void => {
  it('returns false when the snapshot is undefined', (): void => {
    const noSnapshot: DeploymentStateSnapshot | undefined = undefined;
    expect(invokeHasExistingOneShotState(noSnapshot)).to.be.false;
  });

  it('returns false when all fields are empty', (): void => {
    expect(invokeHasExistingOneShotState(makeSnapshot())).to.be.false;
  });

  it('returns true when the remote ConfigMap exists', (): void => {
    expect(
      invokeHasExistingOneShotState(makeSnapshot({remoteConfig: {configMapExists: true, componentPhases: new Map()}})),
    ).to.be.true;
  });

  it('returns true when a Helm release is installed', (): void => {
    expect(
      invokeHasExistingOneShotState(makeSnapshot({helm: {installedReleases: new Set<string>(['solo-deployment'])}})),
    ).to.be.true;
  });

  it('returns true when the accounts file exists', (): void => {
    expect(invokeHasExistingOneShotState(makeSnapshot({accounts: {accountsFileExists: true}}))).to.be.true;
  });

  it('returns true when a component phase is at DEPLOYED', (): void => {
    expect(
      invokeHasExistingOneShotState(
        makeSnapshot({
          remoteConfig: {
            configMapExists: false,
            componentPhases: new Map([[ComponentTypes.MirrorNode, DeploymentPhase.DEPLOYED]]),
          },
        }),
      ),
    ).to.be.true;
  });

  it('returns false when the only component phase is below DEPLOYED', (): void => {
    expect(
      invokeHasExistingOneShotState(
        makeSnapshot({
          remoteConfig: {
            configMapExists: false,
            componentPhases: new Map([[ComponentTypes.MirrorNode, DeploymentPhase.REQUESTED]]),
          },
        }),
      ),
    ).to.be.false;
  });
});

describe('DefaultOneShotDeployOrchestrator buildAutoCleanConfirmationMessage', (): void => {
  it('lists the remote config, Helm releases, and accounts file', (): void => {
    const message: string = invokeAutoCleanConfirmationMessage(
      makeSnapshot({
        remoteConfig: {configMapExists: true, componentPhases: new Map()},
        helm: {installedReleases: new Set<string>(['solo-deployment'])},
        accounts: {accountsFileExists: true},
      }),
    );
    expect(message).to.include('remote config (ConfigMap)');
    expect(message).to.include('solo-deployment');
    expect(message).to.include('accounts file on disk');
  });

  it('lists detected component phases so the dialog is never blank', (): void => {
    const message: string = invokeAutoCleanConfirmationMessage(
      makeSnapshot({
        remoteConfig: {
          configMapExists: false,
          componentPhases: new Map([[ComponentTypes.Explorer, DeploymentPhase.DEPLOYED]]),
        },
      }),
    );
    expect(message).to.match(/component .* in phase/);
  });
});

function makeMinimalOrchestrator(): DefaultOneShotDeployOrchestrator {
  return new DefaultOneShotDeployOrchestrator(
    {} as MockType,
    {
      emit: sinon.stub(),
      waitFor: sinon.stub(),
      abort: sinon.stub(),
      abortReason: sinon.stub(),
      reset: sinon.stub(),
    } as MockType,
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
    {} as MockType,
    {} as MockType,
    {} as MockType,
  );
}

function getConfirmCleanupPhase(): MockType {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
  const pipeline: OrchestratorPipeline<OneShotSingleDeployContext> = orchestrator.buildDeployPipeline(
    {_: []} as MockType,
    {required: [], optional: []} as MockType,
    {} as MockType,
    {} as MockType,
  );
  return (pipeline.tasks as MockType[]).find(
    (task: MockType): boolean => task.title === 'Confirm cleanup of existing deployment state',
  );
}

describe('DefaultOneShotDeployOrchestrator Confirm cleanup of existing deployment state phase', (): void => {
  const existingState: DeploymentStateSnapshot = makeSnapshot({
    remoteConfig: {configMapExists: true, componentPhases: new Map()},
  });

  it('skips when there is no pre-existing state', (): void => {
    const phase: MockType = getConfirmCleanupPhase();
    expect(phase.skip({config: makeConfig(), deploymentStateSnapshot: makeSnapshot()})).to.be.true;
  });

  it('does not skip when pre-existing state is detected', (): void => {
    const phase: MockType = getConfirmCleanupPhase();
    expect(phase.skip({config: makeConfig(), deploymentStateSnapshot: existingState})).to.be.false;
  });

  it('throws ConfirmationRequiredSoloError under --quiet', async (): Promise<void> => {
    const phase: MockType = getConfirmCleanupPhase();
    const task: MockListr = makeTaskWrapper(true);
    try {
      await phase.task({config: makeConfig({quiet: true}), deploymentStateSnapshot: existingState}, task);
      expect.fail('expected ConfirmationRequiredSoloError to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(ConfirmationRequiredSoloError);
      expect(task.prompt).to.not.have.been.called;
    }
  });

  it('throws ConfirmationRequiredSoloError under --force', async (): Promise<void> => {
    const phase: MockType = getConfirmCleanupPhase();
    const task: MockListr = makeTaskWrapper(true);
    try {
      await phase.task({config: makeConfig({force: true}), deploymentStateSnapshot: existingState}, task);
      expect.fail('expected ConfirmationRequiredSoloError to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(ConfirmationRequiredSoloError);
      expect(task.prompt).to.not.have.been.called;
    }
  });

  it('proceeds when the user confirms', async (): Promise<void> => {
    const phase: MockType = getConfirmCleanupPhase();
    const task: MockListr = makeTaskWrapper(true);
    await phase.task({config: makeConfig(), deploymentStateSnapshot: existingState}, task);
    expect(task.prompt).to.have.been.calledOnce;
  });

  it('throws UserBreak when the user declines', async (): Promise<void> => {
    const phase: MockType = getConfirmCleanupPhase();
    const task: MockListr = makeTaskWrapper(false);
    try {
      await phase.task({config: makeConfig(), deploymentStateSnapshot: existingState}, task);
      expect.fail('expected UserBreak to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(UserBreak);
    }
  });
});
