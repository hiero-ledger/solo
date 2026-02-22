// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonSandbox} from 'sinon';
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
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';

const getBaseCommandOptions = (context: string) => {
  const options = {
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
  });
});
