// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonSandbox, type SinonStub, type SinonStubbedInstance} from 'sinon';
import {before, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import yaml from 'yaml';
import {getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ConfigManager} from '../../../src/core/config-manager.js';
import {ChartManager} from '../../../src/core/chart-manager.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {DependencyManager} from '../../../src/core/dependency-managers/index.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {DefaultHelmClient} from '../../../src/integration/helm/impl/default-helm-client.js';
import {ClusterCommandHandlers} from '../../../src/commands/cluster/handlers.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {ClusterCommandTasks} from '../../../src/commands/cluster/tasks.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {type ClusterChecks} from '../../../src/core/cluster-checks.js';
import {type ConfigMap} from '../../../src/integration/kube/resources/config-map/config-map.js';
import {type ClusterReferenceResetContext} from '../../../src/commands/cluster/config-interfaces/cluster-reference-reset-context.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../src/types/index.js';
import {type ArgvStruct} from '../../../src/types/aliases.js';
import {UserBreak} from '../../../src/core/errors/user-break.js';
import {ClusterRoleCheckFailedSoloError} from '../../../src/core/errors/classes/system/cluster-role-check-failed-solo-error.js';
import {type LockManager} from '../../../src/core/lock/lock-manager.js';
import {type RemoteConfigRuntimeState} from '../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {type OneShotState} from '../../../src/core/one-shot-state.js';

type BaseCommandOptions = {
  logger: SinonStubbedInstance<SoloLogger>;
  helm: SinonStubbedInstance<DefaultHelmClient>;
  k8Factory: SinonStubbedInstance<K8ClientFactory>;
  chartManager: SinonStubbedInstance<ChartManager>;
  configManager: SinonStubbedInstance<ConfigManager>;
  depManager: SinonStubbedInstance<DependencyManager>;
  localConfig: SinonStubbedInstance<LocalConfigRuntimeState>;
};

const getBaseCommandOptions: (context: string) => BaseCommandOptions = (context: string): BaseCommandOptions => {
  const options: BaseCommandOptions = {
    logger: sandbox.createStubInstance<SoloLogger>(SoloPinoLogger),
    helm: sandbox.createStubInstance(DefaultHelmClient),
    k8Factory: sandbox.createStubInstance(K8ClientFactory),
    chartManager: sandbox.createStubInstance(ChartManager),
    configManager: sandbox.createStubInstance(ConfigManager),
    depManager: sandbox.createStubInstance(DependencyManager),
    localConfig: sandbox.createStubInstance(LocalConfigRuntimeState),
  };
  const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
  options.k8Factory.default.returns(new K8Client(context, k8Factory.default().getKubectlExecutablePath()));
  return options;
};

const testName: string = 'cluster-cmd-unit';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
const sandbox: SinonSandbox = sinon.createSandbox();

argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.deployment, `${namespace.name}-deployment`);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);

interface UninstallTaskHarness {
  tasks: ClusterCommandTasks;
  logger: SoloLogger;
  clusterRoleExists: SinonStub;
  deleteClusterRole: SinonStub;
  listRemoteConfigsInAnyNamespace: SinonStub;
  chartManagerUninstall: SinonStub;
}

interface TaskWrapperStub {
  newListr: SinonStub;
  skip: SinonStub;
  prompt: SinonStub;
}

/** Builds a {@link ClusterCommandTasks} whose cluster interactions are entirely stubbed out. */
function makeUninstallTaskHarness(): UninstallTaskHarness {
  const clusterRoleExists: SinonStub = sinon.stub().resolves(false);
  const deleteClusterRole: SinonStub = sinon.stub().resolves();
  const listRemoteConfigsInAnyNamespace: SinonStub = sinon.stub().resolves([]);
  const chartManagerUninstall: SinonStub = sinon.stub().resolves();

  const logger: SoloLogger = {
    debug: sinon.stub(),
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
    showUser: sinon.stub(),
    showUserError: sinon.stub(),
    showUserUnlessOneShot: sinon.stub(),
    showList: sinon.stub(),
    showListIfNotEmpty: sinon.stub(),
    addMessageGroup: sinon.stub(),
    addMessageGroupMessage: sinon.stub(),
    showMessageGroup: sinon.stub(),
  } as unknown as SoloLogger;

  const tasks: ClusterCommandTasks = new ClusterCommandTasks(
    {getK8: (): unknown => ({rbac: (): unknown => ({clusterRoleExists, deleteClusterRole})})} as unknown as K8Factory,
    {} as unknown as LocalConfigRuntimeState,
    logger,
    {
      uninstall: chartManagerUninstall,
      isChartInstalled: sinon.stub().resolves(false),
      getInstalledCharts: sinon.stub().resolves([]),
    } as unknown as ChartManager,
    {} as unknown as LockManager,
    {listRemoteConfigsInAnyNamespace} as unknown as ClusterChecks,
    {} as unknown as RemoteConfigRuntimeState,
    {isActive: (): boolean => false} as unknown as OneShotState,
  );

  return {
    tasks,
    logger,
    clusterRoleExists,
    deleteClusterRole,
    listRemoteConfigsInAnyNamespace,
    chartManagerUninstall,
  };
}

function makeTaskWrapperStub(promptAnswer: boolean = true): TaskWrapperStub {
  return {
    newListr: sinon.stub().returns({}),
    skip: sinon.stub(),
    prompt: sinon.stub().returns({run: sinon.stub().resolves(promptAnswer)}),
  };
}

function makeRemoteConfigMap(namespaceName: string, deploymentName: string): ConfigMap {
  return {
    namespace: NamespaceName.of(namespaceName),
    name: constants.SOLO_REMOTE_CONFIGMAP_NAME,
    data: {
      [constants.SOLO_REMOTE_CONFIGMAP_DATA_KEY]: yaml.stringify({clusters: [{deployment: deploymentName}]}),
    },
  };
}

function runResetTask(
  listrTask: SoloListrTask<ClusterReferenceResetContext>,
  taskWrapper: TaskWrapperStub,
): Promise<unknown> {
  const context_: ClusterReferenceResetContext = {
    config: {
      clusterReference: 'cluster-1',
      clusterSetupNamespace: constants.SOLO_SETUP_NAMESPACE,
      context: 'kind-solo',
    },
  };
  return Promise.resolve(
    listrTask.task(context_, taskWrapper as unknown as SoloListrTaskWrapper<ClusterReferenceResetContext>),
  );
}

describe('ClusterCommand unit tests', (): void => {
  before(async (): Promise<void> => {
    resetForTest(namespace.name);
    const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
    await localConfig.load();
  });

  describe('Chart Install Function is called correctly', (): void => {
    let options: any;

    afterEach((): void => {
      sandbox.restore();
    });

    beforeEach((): void => {
      const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
      const context: string = k8Factory.default().contexts().readCurrent();
      options = getBaseCommandOptions(context);
      options.logger = container.resolve(InjectTokens.SoloLogger);
      options.helm = container.resolve(InjectTokens.Helm);
      options.chartManager = container.resolve(InjectTokens.ChartManager);
      options.helm.dependency = sandbox.stub();

      options.chartManager.isChartInstalled = sandbox.stub().returns(false);
      options.chartManager.install = sandbox.stub().returns(true);

      // Simple mock for installPodMonitorRole to avoid cluster connection
      sandbox.stub(ClusterCommandTasks.prototype, 'installPodMonitorRole' as any).returns({
        title: 'Install pod-monitor-role ClusterRole',
        task: async (): Promise<void> => {},
      });

      sandbox.stub(ClusterCommandTasks.prototype, 'findMinioOperator' as any).returns({
        exists: false,
        releaseName: undefined,
      });

      options.configManager = container.resolve(InjectTokens.ConfigManager);
      options.remoteConfig = sandbox.stub();
    });

    it('Install function is called with expected parameters', async (): Promise<void> => {
      const clusterCommandHandlers: ClusterCommandHandlers = container.resolve(ClusterCommandHandlers);
      await clusterCommandHandlers.setup(argv.build());

      expect(options.chartManager.install.args[0][0].name).to.equal(constants.SOLO_SETUP_NAMESPACE.name);
      expect(options.chartManager.install.args[0][1]).to.equal(constants.MINIO_OPERATOR_RELEASE_NAME);
      expect(options.chartManager.install.args[0][2]).to.equal(constants.MINIO_OPERATOR_CHART);
      expect(options.chartManager.install.args[0][3]).to.equal(constants.MINIO_OPERATOR_CHART);
    });

    it('Should use local chart directory', async (): Promise<void> => {
      argv.setArg(flags.chartDirectory, 'test-directory');
      argv.setArg(flags.force, true);

      const clusterCommandHandlers: ClusterCommandHandlers = container.resolve(ClusterCommandHandlers);
      await clusterCommandHandlers.setup(argv.build());

      expect(options.chartManager.install.args[0][2]).to.equal(constants.MINIO_OPERATOR_CHART);
    });

    it('Prometheus stack install passes the solo prometheus values file', async (): Promise<void> => {
      argv.setArg(flags.deployPrometheusStack, true);

      const clusterCommandHandlers: ClusterCommandHandlers = container.resolve(ClusterCommandHandlers);
      await clusterCommandHandlers.setup(argv.build());

      const prometheusInstall: unknown[] | undefined = options.chartManager.install.args.find(
        (callArguments: unknown[]): boolean => callArguments[1] === constants.PROMETHEUS_RELEASE_NAME,
      );
      expect(prometheusInstall, 'expected a chart install call for the prometheus stack').to.not.equal(undefined);
      expect(prometheusInstall[4]).to.equal(version.PROMETHEUS_STACK_VERSION);
      expect((prometheusInstall[5] as HelmChartValues).toArguments()).to.deep.equal([
        '--values',
        constants.PROMETHEUS_STACK_VALUES_FILE,
      ]);

      argv.setArg(flags.deployPrometheusStack, false);
    });
  });

  describe('uninstallPodMonitorRole', (): void => {
    afterEach((): void => {
      sandbox.restore();
    });

    it('deletes the ClusterRole when it exists', async (): Promise<void> => {
      const harness: UninstallTaskHarness = makeUninstallTaskHarness();
      harness.clusterRoleExists.resolves(true);

      await runResetTask(harness.tasks.uninstallPodMonitorRole(), makeTaskWrapperStub());

      expect(harness.clusterRoleExists.calledOnceWith(constants.POD_MONITOR_ROLE)).to.equal(true);
      expect(harness.deleteClusterRole.calledOnceWith(constants.POD_MONITOR_ROLE)).to.equal(true);
    });

    it('leaves the ClusterRole in place when it does not exist', async (): Promise<void> => {
      const harness: UninstallTaskHarness = makeUninstallTaskHarness();
      harness.clusterRoleExists.resolves(false);

      await runResetTask(harness.tasks.uninstallPodMonitorRole(), makeTaskWrapperStub());

      expect(harness.clusterRoleExists.calledOnceWith(constants.POD_MONITOR_ROLE)).to.equal(true);
      expect(harness.deleteClusterRole.called).to.equal(false);
    });

    it('throws instead of swallowing an unexpected kubernetes api failure', async (): Promise<void> => {
      const harness: UninstallTaskHarness = makeUninstallTaskHarness();
      harness.clusterRoleExists.rejects(new Error('api unavailable'));

      let caught: Error | undefined;
      try {
        await runResetTask(harness.tasks.uninstallPodMonitorRole(), makeTaskWrapperStub());
      } catch (error) {
        caught = error as Error;
      }

      expect(caught).to.be.instanceOf(ClusterRoleCheckFailedSoloError);
      expect(harness.deleteClusterRole.called).to.equal(false);
    });
  });

  describe('uninstallClusterChart', (): void => {
    afterEach((): void => {
      sandbox.restore();
    });

    it('preserves the shared cluster resources when another deployment still uses the cluster', async (): Promise<void> => {
      const harness: UninstallTaskHarness = makeUninstallTaskHarness();
      harness.listRemoteConfigsInAnyNamespace.resolves([makeRemoteConfigMap('other-namespace', 'other-deployment')]);
      const taskWrapper: TaskWrapperStub = makeTaskWrapperStub();

      await runResetTask(harness.tasks.uninstallClusterChart({force: true} as unknown as ArgvStruct), taskWrapper);

      expect(taskWrapper.newListr.called, 'no uninstall subtask may be scheduled').to.equal(false);
      expect(taskWrapper.skip.calledOnce).to.equal(true);
      expect(harness.deleteClusterRole.called).to.equal(false);
      expect(harness.chartManagerUninstall.called).to.equal(false);
      expect(
        (harness.logger.addMessageGroupMessage as SinonStub).calledWith(
          'preserved-cluster-resources',
          'other-namespace : other-deployment',
        ),
        'the preserved deployments must be reported to the user',
      ).to.equal(true);
    });

    it('uninstalls the shared cluster resources when no other deployment uses the cluster', async (): Promise<void> => {
      const harness: UninstallTaskHarness = makeUninstallTaskHarness();
      harness.listRemoteConfigsInAnyNamespace.resolves([]);
      const taskWrapper: TaskWrapperStub = makeTaskWrapperStub();

      await runResetTask(harness.tasks.uninstallClusterChart({force: true} as unknown as ArgvStruct), taskWrapper);

      expect(taskWrapper.skip.called).to.equal(false);
      expect(taskWrapper.newListr.calledOnce).to.equal(true);
      const subtaskTitles: string[] = (
        taskWrapper.newListr.firstCall.args[0] as SoloListrTask<ClusterReferenceResetContext>[]
      ).map((subtask: SoloListrTask<ClusterReferenceResetContext>): string => subtask.title as string);
      expect(subtaskTitles).to.deep.equal([
        'Uninstall metrics-server chart',
        'Uninstall Prometheus Stack chart',
        'Uninstall MinIO Operator chart',
        'Uninstall pod-monitor-role ClusterRole',
      ]);
    });

    it('aborts instead of deleting when the interactive user declines', async (): Promise<void> => {
      const harness: UninstallTaskHarness = makeUninstallTaskHarness();
      harness.listRemoteConfigsInAnyNamespace.resolves([makeRemoteConfigMap('other-namespace', 'other-deployment')]);
      const taskWrapper: TaskWrapperStub = makeTaskWrapperStub(false);

      let caught: Error | undefined;
      try {
        await runResetTask(harness.tasks.uninstallClusterChart({force: false} as unknown as ArgvStruct), taskWrapper);
      } catch (error) {
        caught = error as Error;
      }

      expect(caught).to.be.instanceOf(UserBreak);
      expect(taskWrapper.newListr.called).to.equal(false);
    });

    it('propagates a failed remote config lookup instead of deleting shared resources', async (): Promise<void> => {
      const harness: UninstallTaskHarness = makeUninstallTaskHarness();
      harness.listRemoteConfigsInAnyNamespace.rejects(new Error('api unavailable'));
      const taskWrapper: TaskWrapperStub = makeTaskWrapperStub();

      let caught: Error | undefined;
      try {
        await runResetTask(harness.tasks.uninstallClusterChart({force: true} as unknown as ArgvStruct), taskWrapper);
      } catch (error) {
        caught = error as Error;
      }

      expect(caught?.message).to.equal('api unavailable');
      expect(taskWrapper.newListr.called).to.equal(false);
    });
  });
});
