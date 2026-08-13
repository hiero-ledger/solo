// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonSandbox, type SinonStubbedInstance} from 'sinon';
import {before, beforeEach, describe} from 'mocha';
import {expect} from 'chai';
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
import {type ClusterReferenceResetContext} from '../../../src/commands/cluster/config-interfaces/cluster-reference-reset-context.js';
import {type SoloListrTaskWrapper, type SoloListrTask} from '../../../src/types/index.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';

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
      options.chartManager.getInstalledRelease = sandbox.stub().resolves();
      options.chartManager.install = sandbox.stub().returns(true);

      // Simple mock for installPodMonitorRole to avoid cluster connection
      sandbox.stub(ClusterCommandTasks.prototype, 'installPodMonitorRole' as any).returns({
        title: 'Install pod-monitor-role ClusterRole',
        task: async (): Promise<void> => {},
      });

      sandbox.stub(ClusterCommandTasks.prototype, 'findMinioOperatorCrds' as any).resolves([]);

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
    let tasks: ClusterCommandTasks;
    let rbacStub: any;

    afterEach((): void => {
      sandbox.restore();
    });

    beforeEach((): void => {
      const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
      rbacStub = {
        clusterRoleExists: sandbox.stub(),
        deleteClusterRole: sandbox.stub().resolves(),
      };

      const k8Stub: Record<string, unknown> = {
        rbac: (): typeof rbacStub => rbacStub,
      };

      sandbox.stub(k8Factory, 'getK8').returns(k8Stub as unknown as ReturnType<K8Factory['getK8']>);

      tasks = container.resolve(InjectTokens.ClusterCommandTasks);
    });

    it('deletes ClusterRole when it exists', async (): Promise<void> => {
      rbacStub.clusterRoleExists.resolves(true);

      const task: SoloListrTask<ClusterReferenceResetContext> = tasks.uninstallPodMonitorRole();
      await task.task(
        {config: {context: 'test-context'}} as unknown as ClusterReferenceResetContext,
        {} as unknown as SoloListrTaskWrapper<ClusterReferenceResetContext>,
      );

      expect(rbacStub.clusterRoleExists.calledOnceWith(constants.POD_MONITOR_ROLE)).to.be.true;
      expect(rbacStub.deleteClusterRole.calledOnceWith(constants.POD_MONITOR_ROLE)).to.be.true;
    });

    it('does not delete ClusterRole when it does not exist', async (): Promise<void> => {
      rbacStub.clusterRoleExists.resolves(false);

      const task: SoloListrTask<ClusterReferenceResetContext> = tasks.uninstallPodMonitorRole();
      await task.task(
        {config: {context: 'test-context'}} as unknown as ClusterReferenceResetContext,
        {} as unknown as SoloListrTaskWrapper<ClusterReferenceResetContext>,
      );

      expect(rbacStub.clusterRoleExists.calledOnceWith(constants.POD_MONITOR_ROLE)).to.be.true;
      expect(rbacStub.deleteClusterRole.notCalled).to.be.true;
    });

    it('throws error when clusterRoleExists API fails', async (): Promise<void> => {
      const apiError: Error = new Error('API unavailable');
      rbacStub.clusterRoleExists.rejects(apiError);

      const task: SoloListrTask<ClusterReferenceResetContext> = tasks.uninstallPodMonitorRole();

      try {
        await task.task(
          {config: {context: 'test-context'}} as unknown as ClusterReferenceResetContext,
          {} as unknown as SoloListrTaskWrapper<ClusterReferenceResetContext>,
        );
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect((error as Error).message).to.include('Failed to check if ClusterRole exists');
      }

      expect(rbacStub.clusterRoleExists.calledOnceWith(constants.POD_MONITOR_ROLE)).to.be.true;
      expect(rbacStub.deleteClusterRole.notCalled).to.be.true;
    });
  });

  describe('MinIO Operator, whose CRDs outlive the namespace it was installed into', (): void => {
    const configuredNamespace: NamespaceName = NamespaceName.of('solo-cluster-setup');
    const installedNamespace: string = 'solo-setup';
    let tasks: ClusterCommandTasks;
    let chartManager: any;
    let crdsStub: any;

    afterEach((): void => {
      sandbox.restore();
    });

    beforeEach((): void => {
      const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
      crdsStub = {ifExists: sandbox.stub().resolves(false)};
      sandbox
        .stub(k8Factory, 'getK8')
        .returns({crds: (): typeof crdsStub => crdsStub} as unknown as ReturnType<K8Factory['getK8']>);

      chartManager = container.resolve(InjectTokens.ChartManager);
      chartManager.install = sandbox.stub().resolves(true);
      chartManager.uninstall = sandbox.stub().resolves(true);
      chartManager.getInstalledRelease = sandbox.stub().resolves();

      tasks = container.resolve(InjectTokens.ClusterCommandTasks);
    });

    it('reuses a pre-existing operator instead of installing over its CRDs', async (): Promise<void> => {
      crdsStub.ifExists.resolves(true);

      await tasks.installMinioOperatorChart(configuredNamespace, 'test-context');

      expect(chartManager.install.notCalled).to.be.true;
    });

    it('installs when none of its CRDs are present', async (): Promise<void> => {
      await tasks.installMinioOperatorChart(configuredNamespace, 'test-context');

      expect(chartManager.install.calledOnce).to.be.true;
      expect(chartManager.install.args[0][0]).to.equal(configuredNamespace);
    });

    async function runUninstall(): Promise<void> {
      const task: SoloListrTask<ClusterReferenceResetContext> = tasks.uninstallMinioOperator();
      await task.task(
        {
          config: {context: 'test-context', clusterSetupNamespace: configuredNamespace},
        } as unknown as ClusterReferenceResetContext,
        {} as unknown as SoloListrTaskWrapper<ClusterReferenceResetContext>,
      );
    }

    it('uninstalls from the namespace the release is actually in, not the configured one', async (): Promise<void> => {
      chartManager.getInstalledRelease.resolves({
        name: constants.MINIO_OPERATOR_RELEASE_NAME,
        namespace: installedNamespace,
      });

      await runUninstall();

      // Looked up across all namespaces, so a reset run against a different namespace still finds it.
      expect(chartManager.getInstalledRelease.args[0][0]).to.be.undefined;
      expect(chartManager.uninstall.args[0][0].name).to.equal(installedNamespace);
      expect(chartManager.uninstall.args[0][1]).to.equal(constants.MINIO_OPERATOR_RELEASE_NAME);
    });

    it('skips the uninstall when no release exists', async (): Promise<void> => {
      await runUninstall();

      expect(chartManager.uninstall.notCalled).to.be.true;
    });
  });
});
