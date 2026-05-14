// SPDX-License-Identifier: Apache-2.0

import {beforeEach, afterEach, describe, it} from 'mocha';
import {expect} from 'chai';
import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {container} from 'tsyringe-neo';
import {ExplorerCommand} from '../../../src/commands/explorer.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {resetForTest} from '../../test-container.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import * as constants from '../../../src/core/constants.js';
import {ComponentTypes} from '../../../src/core/config/remote/enumerations/component-types.js';
import {DeploymentPhase} from '../../../src/data/schema/model/remote/deployment-phase.js';
import {SemanticVersion} from '../../../src/business/utils/semantic-version.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';

type TaskContext = {
  config?: Record<string, unknown>;
};

type PromptRunner = {
  run: (promptFunction: unknown, options: {default: boolean; message: string}) => Promise<boolean>;
};

type TaskWrapper = {
  prompt: (adapter: unknown) => PromptRunner;
  newListr: (tasks: TaskLike[], options: Record<string, unknown>) => FakeListr;
};

type TaskLike = {
  title?: string;
  skip?: (context: TaskContext) => boolean | Promise<boolean>;
  task?: (context: TaskContext, task: TaskWrapper) => Promise<void> | void;
};

type FakeListr = {
  isRoot: () => boolean;
  run: () => Promise<void>;
};

type ExplorerHarness = {
  command: ExplorerCommand;
  taskList: Record<string, unknown>;
  chartManager: Record<string, unknown>;
  configManager: Record<string, unknown>;
  remoteConfig: Record<string, unknown>;
  localConfig: LocalConfigRuntimeState;
  clusterChecks: Record<string, unknown>;
  componentFactory: Record<string, unknown>;
  leaseManager: Record<string, unknown>;
  oneShotState: Record<string, unknown>;
  k8Factory: Record<string, unknown>;
  tasks: TaskLike[];
  fakeTask: TaskWrapper;
  promptRunStub: SinonStub;
};

const createNamespace = (namespaceName: string): NamespaceName => NamespaceName.of(namespaceName);

const createReleaseName = (id: number): string => `${constants.EXPLORER_RELEASE_NAME}-${id}`;

const createIngressReleaseName = (namespaceName: string, id: number): string =>
  `${constants.EXPLORER_INGRESS_CONTROLLER_RELEASE_NAME}-${id}-${namespaceName}`;

const createDeployConfig = (namespaceName: string): Record<string, unknown> => ({
  cacheDir: 'cache-dir',
  chartDirectory: '',
  explorerChartDirectory: '',
  clusterRef: '',
  clusterContext: '',
  enableIngress: true,
  enableExplorerTls: true,
  ingressControllerValueFile: '',
  explorerTlsHostName: 'explorer.example.test',
  explorerStaticIp: '',
  explorerVersion: '1.2.3',
  namespace: createNamespace(namespaceName),
  tlsClusterIssuerType: 'acme-staging',
  valuesFile: '',
  valuesArg: '',
  clusterSetupNamespace: createNamespace(namespaceName),
  getUnusedConfigs: (): string[] => [],
  soloChartVersion: '1.2.3',
  domainName: 'explorer.example.test',
  releaseName: createReleaseName(1),
  ingressReleaseName: createIngressReleaseName(namespaceName, 1),
  newExplorerComponent: {metadata: {id: 1, phase: DeploymentPhase.REQUESTED}},
  id: 1,
  forcePortForward: false,
  isChartInstalled: false,
  isLegacyChartInstalled: false,
  mirrorNodeId: 1,
  mirrorNamespace: 'mirror-ns',
  mirrorNodeReleaseName: 'mirror-node-1',
  isMirrorNodeLegacyChartInstalled: false,
});

const createUpgradeConfig = (namespaceName: string): Record<string, unknown> => ({
  cacheDir: 'cache-dir',
  chartDirectory: '',
  explorerChartDirectory: '',
  clusterRef: '',
  clusterContext: '',
  enableIngress: true,
  enableExplorerTls: false,
  ingressControllerValueFile: '',
  explorerTlsHostName: 'explorer.example.test',
  explorerStaticIp: '',
  explorerVersion: '1.2.4',
  namespace: createNamespace(namespaceName),
  tlsClusterIssuerType: 'acme-staging',
  valuesFile: '',
  valuesArg: '',
  clusterSetupNamespace: createNamespace(namespaceName),
  getUnusedConfigs: (): string[] => [],
  soloChartVersion: '1.2.4',
  domainName: 'explorer.example.test',
  releaseName: createReleaseName(1),
  ingressReleaseName: createIngressReleaseName(namespaceName, 1),
  forcePortForward: false,
  id: 1,
  isChartInstalled: true,
  isLegacyChartInstalled: false,
  mirrorNodeId: 1,
  mirrorNamespace: 'mirror-ns',
  mirrorNodeReleaseName: 'mirror-node-1',
  isMirrorNodeLegacyChartInstalled: false,
});

const createDestroyConfig = (namespaceName: string): Record<string, unknown> => ({
  clusterContext: 'cluster-context-1',
  clusterReference: 'cluster-ref-1',
  namespace: createNamespace(namespaceName),
  isChartInstalled: true,
  id: 1,
  releaseName: createReleaseName(1),
  ingressReleaseName: createIngressReleaseName(namespaceName, 1),
  isLegacyChartInstalled: false,
});

const createHarness = async (sandbox: SinonSandbox): Promise<ExplorerHarness> => {
  resetForTest();
  const command: ExplorerCommand = container.resolve(ExplorerCommand);
  const localConfig: LocalConfigRuntimeState =
    (command as unknown as {localConfig: LocalConfigRuntimeState}).localConfig;
  await localConfig.load();
  const taskList: Record<string, unknown> = (command as unknown as {taskList: unknown}).taskList as Record<string, unknown>;
  const chartManager: Record<string, unknown> =
    (command as unknown as {chartManager: unknown}).chartManager as Record<string, unknown>;
  const configManager: Record<string, unknown> =
    (command as unknown as {configManager: unknown}).configManager as Record<string, unknown>;
  const remoteConfig: Record<string, unknown> =
    (command as unknown as {remoteConfig: unknown}).remoteConfig as Record<string, unknown>;
  const clusterChecks: Record<string, unknown> =
    (command as unknown as {clusterChecks: unknown}).clusterChecks as Record<string, unknown>;
  const componentFactory: Record<string, unknown> =
    (command as unknown as {componentFactory: unknown}).componentFactory as Record<string, unknown>;
  const leaseManager: Record<string, unknown> =
    (command as unknown as {leaseManager: unknown}).leaseManager as Record<string, unknown>;
  const oneShotState: Record<string, unknown> =
    (command as unknown as {oneShotState: unknown}).oneShotState as Record<string, unknown>;
  const k8Factory: Record<string, unknown> =
    (command as unknown as {k8Factory: unknown}).k8Factory as Record<string, unknown>;

  const tasks: TaskLike[] = [];
  const promptRunStub: SinonStub = sandbox.stub().resolves(true);
  const fakeTask: TaskWrapper = {
    prompt: sandbox.stub().returns({run: promptRunStub}),
    newListr: (_tasks: TaskLike[], _options: Record<string, unknown>): FakeListr => ({
      isRoot: (): boolean => false,
      run: async (): Promise<void> => {
        return;
      },
    }),
  };

  sandbox.stub(taskList, 'newTaskList').callsFake((taskListInput: unknown): FakeListr => {
    tasks.splice(0, tasks.length);
    if (Array.isArray(taskListInput)) {
      tasks.push(...(taskListInput as TaskLike[]));
    } else {
      tasks.push(taskListInput as TaskLike);
    }

    return {
      isRoot: (): boolean => true,
      run: async (): Promise<void> => {
        const context: TaskContext = {};
        for (let taskIndex: number = 0; taskIndex < tasks.length; taskIndex += 1) {
          const task: TaskLike = tasks[taskIndex];
          if (task.skip && (await task.skip(context))) {
            continue;
          }
          if (task.task) {
            await task.task(context, fakeTask);
          }
        }
      },
    };
  });

  sandbox.stub(localConfig, 'load').resolves();
  sandbox.stub(remoteConfig, 'loadAndValidate').resolves();
  sandbox.stub(remoteConfig, 'load').resolves();
  sandbox.stub(remoteConfig, 'isLoaded').returns(true);
  sandbox.stub(remoteConfig, 'persist').resolves();
  sandbox
    .stub(remoteConfig, 'getComponentVersion')
    .returns(new SemanticVersion<string>('1.2.3'));
  sandbox.stub(remoteConfig, 'updateComponentVersion').returns(undefined);

  sandbox.stub(configManager, 'update').returns(undefined);
  sandbox.stub(configManager, 'executePrompt').resolves();
  sandbox.stub(configManager, 'getConfig').returns({});
  sandbox.stub(configManager, 'getFlag').callsFake((flag: CommandFlag): unknown => {
    if (flag === flags.id) {
      return 1;
    }
    if (flag === flags.externalAddress) {
      return undefined;
    }
    return undefined;
  });

  sandbox.stub(leaseManager, 'create').resolves({release: sandbox.stub().resolves()} as never);
  sandbox.stub(oneShotState, 'isActive').returns(false);

  sandbox.stub(clusterChecks, 'isCertManagerInstalled').resolves(false);
  sandbox
    .stub(chartManager, 'isChartInstalled')
    .callsFake((namespace: unknown, releaseName: string): Promise<boolean> => {
      void namespace;
      return Promise.resolve(releaseName !== constants.EXPLORER_RELEASE_NAME);
    });

  const kubernetesClient: Record<string, unknown> = {
    crds: (): Record<string, unknown> => ({ifExists: sandbox.stub().resolves(false)}),
    pods: (): Record<string, unknown> => ({waitForReadyStatus: sandbox.stub().resolves()}),
    ingresses: (): Record<string, unknown> => ({update: sandbox.stub().resolves()}),
    ingressClasses: (): Record<string, unknown> => ({
      list: sandbox.stub().resolves([]),
      create: sandbox.stub().resolves(),
      delete: sandbox.stub().resolves(),
    }),
    namespaces: (): Record<string, unknown> => ({has: sandbox.stub().resolves(true)}),
  };

  sandbox.stub(k8Factory, 'getK8').returns(kubernetesClient as never);
  sandbox
    .stub(k8Factory, 'default')
    .returns({
      clusters: (): Record<string, unknown> => ({readCurrent: (): string => 'cluster-ref-1'}),
      contexts: (): Record<string, unknown> => ({readCurrent: (): string => 'cluster-context-1'}),
    } as never);

  sandbox.stub(componentFactory, 'createNewExplorerComponent').callsFake((): Record<string, unknown> => ({
    metadata: {id: 1, phase: DeploymentPhase.REQUESTED},
  }));

  sandbox.stub(command as never, 'getClusterReference').returns('cluster-ref-1');
  sandbox.stub(command as never, 'getClusterContext').returns('cluster-context-1');
  sandbox.stub(command as never, 'inferMirrorNodeData').resolves({
    mirrorNodeId: 1,
    mirrorNamespace: 'mirror-ns',
    mirrorNodeReleaseName: 'mirror-node-1',
  });
  sandbox.stub(command as never, 'throwIfNamespaceIsMissing').resolves();
  sandbox.stub(command as never, 'loadRemoteConfigOrWarn').resolves(true);
  sandbox.stub(command as never, 'getNamespace').resolves(createNamespace('explorer-destroy'));

  const fakeRemoteConfig: Record<string, unknown> = {
    components: {
      getNewComponentId: sandbox.stub().returns(1),
      addNewComponent: sandbox.stub(),
      removeComponent: sandbox.stub(),
      changeComponentPhase: sandbox.stub(),
      stopPortForwards: sandbox.stub().resolves(),
      managePortForward: sandbox.stub().resolves(),
      state: {explorers: []},
    },
  };

  sandbox.stub(remoteConfig, 'configuration').get((): Record<string, unknown> => fakeRemoteConfig);

  return {
    command,
    taskList,
    chartManager,
    configManager,
    remoteConfig,
    localConfig,
    clusterChecks,
    componentFactory,
    leaseManager,
    oneShotState,
    k8Factory,
    tasks,
    fakeTask,
    promptRunStub,
  };
};

const getTaskTitles = (tasks: TaskLike[]): string[] => tasks.map((task: TaskLike): string => task.title ?? '');

describe('ExplorerCommand unit tests', (): void => {
  let sandbox: SinonSandbox;

  beforeEach((): void => {
    sandbox = sinon.createSandbox();
  });

  afterEach((): void => {
    sandbox.restore();
  });

  it('add builds the expected task flow and updates explorer state after successful install', async (): Promise<void> => {
    const harness: ExplorerHarness = await createHarness(sandbox);
    const deployConfig: Record<string, unknown> = createDeployConfig('explorer-add');
    const releaseName: string = createReleaseName(1);
    const ingressReleaseName: string = createIngressReleaseName('explorer-add', 1);
    const argv: Record<string, unknown> = {[flags.deployment.name]: 'deployment-1'};

    (harness.configManager.getConfig as SinonStub).returns(deployConfig);
    const chartUpgradeStub: SinonStub = sandbox.stub(harness.chartManager, 'upgrade').resolves();

    await harness.command.add(argv as never);

    const taskListStub: SinonStub = harness.taskList.newTaskList as SinonStub;
    expect(taskListStub).to.have.been.calledOnce;
    expect(taskListStub).to.have.been.calledWithMatch(sinon.match.array, sinon.match.object, undefined, 'explorer node add');
    expect(getTaskTitles(harness.tasks)).to.deep.equal([
      'Initialize',
      'Load remote config',
      'Add explorer to remote config',
      'Install cert manager',
      'Install explorer',
      'Install explorer ingress controller',
      'Check explorer pod is ready',
      'Check haproxy ingress controller pod is ready',
      'Enable port forwarding for explorer',
      'Show user messages',
    ]);

    const loadRemoteConfigStub: SinonStub = harness.remoteConfig.loadAndValidate as SinonStub;
    const updateConfigStub: SinonStub = harness.configManager.update as SinonStub;
    const executePromptStub: SinonStub = harness.configManager.executePrompt as SinonStub;

    sinon.assert.calledOnceWithExactly(loadRemoteConfigStub, argv);
    sinon.assert.calledOnceWithExactly(updateConfigStub, argv);
    sinon.assert.calledOnceWithMatch(executePromptStub, harness.fakeTask, sinon.match.array);

    const components: Record<string, unknown> =
      (harness.remoteConfig.configuration as Record<string, unknown>).components as Record<string, unknown>;
    const addComponentStub: SinonStub = components.addNewComponent as SinonStub;
    const changePhaseStub: SinonStub = components.changeComponentPhase as SinonStub;
    const updateVersionStub: SinonStub = harness.remoteConfig.updateComponentVersion as SinonStub;
    const persistStub: SinonStub = harness.remoteConfig.persist as SinonStub;

    sinon.assert.calledOnceWithMatch(addComponentStub, sinon.match.object, ComponentTypes.Explorer);
    expect(updateVersionStub).to.have.been.calledOnceWithExactly(
      ComponentTypes.Explorer,
      sinon.match.instanceOf(SemanticVersion),
    );
    expect(changePhaseStub).to.have.been.calledOnceWithExactly(1, ComponentTypes.Explorer, DeploymentPhase.DEPLOYED);
    expect(persistStub).to.have.been.calledTwice;

    expect(chartUpgradeStub).to.have.callCount(4);
    expect(chartUpgradeStub.getCall(0).args[1]).to.equal(constants.SOLO_CERT_MANAGER_CHART);
    expect(chartUpgradeStub.getCall(1).args[1]).to.equal(constants.SOLO_CERT_MANAGER_CHART);
    expect(chartUpgradeStub.getCall(2).args[1]).to.equal(releaseName);
    expect(chartUpgradeStub.getCall(3).args[1]).to.equal(ingressReleaseName);

    const kubernetesClient: Record<string, unknown> =
      harness.k8Factory.getK8('cluster-context-1') as Record<string, unknown>;
    const podClient: Record<string, unknown> = kubernetesClient.pods() as Record<string, unknown>;
    const ingressClient: Record<string, unknown> = kubernetesClient.ingresses() as Record<string, unknown>;
    const ingressClassClient: Record<string, unknown> = kubernetesClient.ingressClasses() as Record<string, unknown>;
    const waitForReadyStatusStub: SinonStub = podClient.waitForReadyStatus as SinonStub;
    const ingressUpdateStub: SinonStub = ingressClient.update as SinonStub;
    const ingressCreateStub: SinonStub = ingressClassClient.create as SinonStub;

    expect(waitForReadyStatusStub).to.have.been.calledThrice;
    sinon.assert.calledOnceWithMatch(
      ingressUpdateStub,
      sinon.match.has('name', 'explorer-add'),
      releaseName,
      {
      metadata: {
        annotations: {
          'haproxy-ingress.github.io/backend-protocol': 'h1',
        },
      },
      },
    );
    expect(ingressCreateStub).to.have.been.calledOnceWithExactly(
      ingressReleaseName,
      `${constants.INGRESS_CONTROLLER_PREFIX}${ingressReleaseName}`,
    );

    const stopPortForwardsStub: SinonStub = components.stopPortForwards as SinonStub;
    const managePortForwardsStub: SinonStub = components.managePortForward as SinonStub;

    expect(stopPortForwardsStub).to.not.have.been.called;
    expect(managePortForwardsStub).to.not.have.been.called;
  });

  it('upgrade builds the expected task flow and upgrades explorer state without reinstalling cert-manager', async (): Promise<void> => {
    const harness: ExplorerHarness = await createHarness(sandbox);
    const upgradeConfig: Record<string, unknown> = createUpgradeConfig('explorer-upgrade');
    const releaseName: string = createReleaseName(1);
    const ingressReleaseName: string = createIngressReleaseName('explorer-upgrade', 1);
    const argv: Record<string, unknown> = {[flags.deployment.name]: 'deployment-1'};

    (harness.configManager.getConfig as SinonStub).returns(upgradeConfig);
    const chartUpgradeStub: SinonStub = sandbox.stub(harness.chartManager, 'upgrade').resolves();
    await harness.command.upgrade(argv as never);

    const taskListStub: SinonStub = harness.taskList.newTaskList as SinonStub;
    expect(taskListStub).to.have.been.calledOnce;
    expect(taskListStub).to.have.been.calledWithMatch(
      sinon.match.array,
      sinon.match.object,
      undefined,
      'explorer node upgrade',
    );
    expect(getTaskTitles(harness.tasks)).to.deep.equal([
      'Initialize',
      'Load remote config',
      'Install cert manager',
      'Install explorer',
      'Install explorer ingress controller',
      'Check explorer pod is ready',
      'Check haproxy ingress controller pod is ready',
      'Enable port forwarding for explorer',
    ]);

    const loadRemoteConfigStub: SinonStub = harness.remoteConfig.loadAndValidate as SinonStub;
    const updateConfigStub: SinonStub = harness.configManager.update as SinonStub;
    const executePromptStub: SinonStub = harness.configManager.executePrompt as SinonStub;
    const getComponentVersionStub: SinonStub = harness.remoteConfig.getComponentVersion as SinonStub;

    sinon.assert.calledOnceWithExactly(loadRemoteConfigStub, argv);
    sinon.assert.calledOnceWithExactly(updateConfigStub, argv);
    sinon.assert.calledOnceWithMatch(executePromptStub, harness.fakeTask, sinon.match.array);
    sinon.assert.calledOnceWithExactly(getComponentVersionStub, ComponentTypes.Explorer);

    const components: Record<string, unknown> =
      (harness.remoteConfig.configuration as Record<string, unknown>).components as Record<string, unknown>;
    const addComponentStub: SinonStub = components.addNewComponent as SinonStub;
    const changePhaseStub: SinonStub = components.changeComponentPhase as SinonStub;
    const updateVersionStub: SinonStub = harness.remoteConfig.updateComponentVersion as SinonStub;
    const persistStub: SinonStub = harness.remoteConfig.persist as SinonStub;

    expect(addComponentStub).to.not.have.been.called;
    expect(changePhaseStub).to.not.have.been.called;
    expect(updateVersionStub).to.have.been.calledOnceWithExactly(
      ComponentTypes.Explorer,
      sinon.match.instanceOf(SemanticVersion),
    );
    expect(persistStub).to.have.been.calledOnce;

    expect(chartUpgradeStub).to.have.callCount(2);
    expect(chartUpgradeStub.getCall(0).args[1]).to.equal(releaseName);
    expect(chartUpgradeStub.getCall(1).args[1]).to.equal(ingressReleaseName);

    const kubernetesClient: Record<string, unknown> =
      harness.k8Factory.getK8('cluster-context-1') as Record<string, unknown>;
    const podClient: Record<string, unknown> = kubernetesClient.pods() as Record<string, unknown>;
    const ingressClient: Record<string, unknown> = kubernetesClient.ingresses() as Record<string, unknown>;
    const ingressClassClient: Record<string, unknown> = kubernetesClient.ingressClasses() as Record<string, unknown>;
    const waitForReadyStatusStub: SinonStub = podClient.waitForReadyStatus as SinonStub;
    const ingressUpdateStub: SinonStub = ingressClient.update as SinonStub;
    const ingressCreateStub: SinonStub = ingressClassClient.create as SinonStub;

    expect(waitForReadyStatusStub).to.have.been.calledTwice;
    expect(ingressUpdateStub).to.have.been.calledOnce;
    expect(ingressCreateStub).to.have.been.calledOnce;
  });

  it('destroy removes explorer resources and remote config entries after confirmation', async (): Promise<void> => {
    const harness: ExplorerHarness = await createHarness(sandbox);
    const destroyConfig: Record<string, unknown> = createDestroyConfig('explorer-destroy');
    const ingressReleaseName: string = createIngressReleaseName('explorer-destroy', 1);
    const argv: Record<string, unknown> = {[flags.deployment.name]: 'deployment-1'};

    (harness.configManager.getConfig as SinonStub).returns(destroyConfig);
    const uninstallStub: SinonStub = sandbox.stub(harness.chartManager, 'uninstall').resolves();
    harness.remoteConfig.isLoaded = sandbox.stub().returns(true);

    const ingressClassesListStub: SinonStub = sandbox.stub().resolves([
      {name: ingressReleaseName},
      {name: 'other-ingress'},
    ]);
    const ingressClassesDeleteStub: SinonStub = sandbox.stub().resolves();
    const kubernetesClient: Record<string, unknown> =
      harness.k8Factory.getK8('cluster-context-1') as Record<string, unknown>;
    (kubernetesClient.ingressClasses() as Record<string, unknown>).list = ingressClassesListStub;
    (kubernetesClient.ingressClasses() as Record<string, unknown>).delete = ingressClassesDeleteStub;

    await harness.command.destroy(argv as never);

    const taskListStub: SinonStub = harness.taskList.newTaskList as SinonStub;
    expect(taskListStub).to.have.been.calledOnce;
    expect(taskListStub).to.have.been.calledWithMatch(
      sinon.match.array,
      sinon.match.object,
      undefined,
      'explorer node destroy',
    );
    expect(getTaskTitles(harness.tasks)).to.deep.equal([
      'Initialize',
      'Load remote config',
      'Load remote config',
      'Destroy explorer',
      'Uninstall explorer ingress controller',
      'Remove explorer from remote config',
    ]);

    const loadRemoteConfigWarnStub: SinonStub = (harness.command as unknown as {loadRemoteConfigOrWarn: SinonStub})
      .loadRemoteConfigOrWarn;
    const loadRemoteConfigStub: SinonStub = harness.remoteConfig.loadAndValidate as SinonStub;
    const updateConfigStub: SinonStub = harness.configManager.update as SinonStub;

    sinon.assert.calledOnceWithExactly(loadRemoteConfigWarnStub, argv);
    sinon.assert.calledOnceWithExactly(loadRemoteConfigStub, argv);
    sinon.assert.calledOnceWithExactly(updateConfigStub, argv);

    expect(uninstallStub).to.have.been.calledTwice;
    expect(uninstallStub.getCall(0).args[1]).to.equal(createReleaseName(1));
    expect(uninstallStub.getCall(1).args[1]).to.equal(ingressReleaseName);
    sinon.assert.calledOnceWithMatch(ingressClassesDeleteStub, ingressReleaseName);

    const components: Record<string, unknown> =
      (harness.remoteConfig.configuration as Record<string, unknown>).components as Record<string, unknown>;
    const removeComponentStub: SinonStub = components.removeComponent as SinonStub;
    const persistStub: SinonStub = harness.remoteConfig.persist as SinonStub;

    expect(removeComponentStub).to.have.been.calledOnceWithExactly(1, ComponentTypes.Explorer);
    expect(persistStub).to.have.been.calledOnce;
  });

  it('destroy aborts before cleanup when the user declines confirmation', async (): Promise<void> => {
    const harness: ExplorerHarness = await createHarness(sandbox);
    const destroyConfig: Record<string, unknown> = createDestroyConfig('explorer-destroy');
    const argv: Record<string, unknown> = {[flags.deployment.name]: 'deployment-1'};

    (harness.configManager.getConfig as SinonStub).returns(destroyConfig);
    const uninstallStub: SinonStub = sandbox.stub(harness.chartManager, 'uninstall').resolves();
    harness.promptRunStub.resolves(false);

    await expect(harness.command.destroy(argv as never)).to.be.rejectedWith(
      SoloError,
      'Error destroy explorer: Aborted application by user prompt',
    );

    const components: Record<string, unknown> =
      (harness.remoteConfig.configuration as Record<string, unknown>).components as Record<string, unknown>;
    const removeComponentStub: SinonStub = components.removeComponent as SinonStub;
    const persistStub: SinonStub = harness.remoteConfig.persist as SinonStub;
    const loadRemoteConfigWarnStub: SinonStub = (harness.command as unknown as {loadRemoteConfigOrWarn: SinonStub})
      .loadRemoteConfigOrWarn;

    expect(uninstallStub).to.not.have.been.called;
    expect(removeComponentStub).to.not.have.been.called;
    expect(persistStub).to.not.have.been.called;
    sinon.assert.calledOnceWithExactly(loadRemoteConfigWarnStub, argv);
  });

  it('add fails fast when a dependency install fails and does not continue with later tasks', async (): Promise<void> => {
    const harness: ExplorerHarness = await createHarness(sandbox);
    const deployConfig: Record<string, unknown> = createDeployConfig('explorer-add-failure');
    const argv: Record<string, unknown> = {[flags.deployment.name]: 'deployment-1'};

    (harness.configManager.getConfig as SinonStub).returns(deployConfig);

    const chartUpgradeStub: SinonStub = sandbox.stub(harness.chartManager, 'upgrade');
    chartUpgradeStub.onCall(0).rejects(new Error('helm dependency failed'));

    await expect(harness.command.add(argv as never)).to.be.rejectedWith(
      SoloError,
      'Error deploying explorer: helm dependency failed',
    );

    const components: Record<string, unknown> =
      (harness.remoteConfig.configuration as Record<string, unknown>).components as Record<string, unknown>;
    const addComponentStub: SinonStub = components.addNewComponent as SinonStub;
    const persistStub: SinonStub = harness.remoteConfig.persist as SinonStub;

    expect(addComponentStub).to.have.been.calledOnce;
    expect(persistStub).to.have.been.calledOnce;
    expect(chartUpgradeStub).to.have.been.calledOnce;

    const kubernetesClient: Record<string, unknown> =
      harness.k8Factory.getK8('cluster-context-1') as Record<string, unknown>;
    const podClient: Record<string, unknown> = kubernetesClient.pods() as Record<string, unknown>;
    const waitForReadyStatusStub: SinonStub = podClient.waitForReadyStatus as SinonStub;
    expect(waitForReadyStatusStub).to.not.have.been.called;
  });
});
