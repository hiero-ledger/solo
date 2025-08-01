// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {before, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ROOT_DIR} from '../../../src/core/constants.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {type ChartManager} from '../../../src/core/chart-manager.js';
import {NetworkCommand, type NetworkDeployConfigClass} from '../../../src/commands/network.js';
import {type LockManager} from '../../../src/core/lock/lock-manager.js';
import {type ProfileManager} from '../../../src/core/profile-manager.js';
import {type KeyManager} from '../../../src/core/key-manager.js';
import {ListrLock} from '../../../src/core/lock/listr-lock.js';
import {GenesisNetworkDataConstructor} from '../../../src/core/genesis-network-models/genesis-network-data-constructor.js';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type DependencyManager} from '../../../src/core/dependency-managers/index.js';
import {resetForTest} from '../../test-container.js';
import {type ClusterChecks} from '../../../src/core/cluster-checks.js';
import {type K8ClientConfigMaps} from '../../../src/integration/kube/k8-client/resources/config-map/k8-client-config-maps.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type DefaultHelmClient} from '../../../src/integration/helm/impl/default-helm-client.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {type CertificateManager} from '../../../src/core/certificate-manager.js';
import {type PlatformInstaller} from '../../../src/core/platform-installer.js';
import fs from 'node:fs';
import path from 'node:path';
import {lt as SemVersionLessThan, SemVer} from 'semver';
import {type InstanceOverrides} from '../../../src/core/dependency-injection/container-init.js';
import {ValueContainer} from '../../../src/core/dependency-injection/value-container.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type ClusterReferences} from '../../../src/types/index.js';
import {type RemoteConfigRuntimeState} from '../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {StringFacade} from '../../../src/business/runtime-state/facade/string-facade.js';

const testName = 'network-cmd-unit';
const namespace = NamespaceName.of(testName);
const argv = Argv.getDefaultArgv(namespace);

argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.deployment, 'deployment');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);
argv.setArg(flags.chartDirectory, undefined);
if (SemVersionLessThan(new SemVer(version.HEDERA_PLATFORM_VERSION), new SemVer('v0.61.0'))) {
  argv.setArg(flags.releaseTag, 'v0.61.0');
}

describe('NetworkCommand unit tests', () => {
  before(async () => {
    const sourceDirectory = PathEx.joinWithRealPath('test', 'data');
    const destinationDirectory = path.join(sourceDirectory, 'tmp', 'templates');

    if (!fs.existsSync(destinationDirectory)) {
      fs.mkdirSync(destinationDirectory, {recursive: true});
    }

    fs.copyFileSync(
      PathEx.joinWithRealPath(sourceDirectory, 'application.properties'),
      path.join(destinationDirectory, 'application.properties'),
    );
  });

  describe('Chart Install Function is called correctly', () => {
    let options: any;

    const k8SFactoryStub = sinon.stub() as unknown as K8Factory;
    const clusterChecksStub = sinon.stub() as unknown as ClusterChecks;
    const remoteConfigStub = sinon.stub() as unknown as RemoteConfigRuntimeState;
    const chartManagerStub = sinon.stub() as unknown as ChartManager;
    const certificateManagerStub = sinon.stub() as unknown as CertificateManager;
    const profileManagerStub = sinon.stub() as unknown as ProfileManager;
    const platformInstallerStub = sinon.stub() as unknown as PlatformInstaller;
    const keyManagerStub = sinon.stub() as unknown as KeyManager;
    const depManagerStub = sinon.stub() as unknown as DependencyManager;
    const helmStub = sinon.stub() as unknown as DefaultHelmClient;
    let containerOverrides: InstanceOverrides;

    beforeEach(async () => {
      containerOverrides = new Map<symbol, ValueContainer>([
        [InjectTokens.K8Factory, new ValueContainer(InjectTokens.K8Factory, k8SFactoryStub)],
        [InjectTokens.ClusterChecks, new ValueContainer(InjectTokens.ClusterChecks, clusterChecksStub)],
        [
          InjectTokens.RemoteConfigRuntimeState,
          new ValueContainer(InjectTokens.RemoteConfigRuntimeState, remoteConfigStub),
        ],
        [InjectTokens.ChartManager, new ValueContainer(InjectTokens.ChartManager, chartManagerStub)],
        [InjectTokens.CertificateManager, new ValueContainer(InjectTokens.CertificateManager, certificateManagerStub)],
        [InjectTokens.ProfileManager, new ValueContainer(InjectTokens.ProfileManager, profileManagerStub)],
        [InjectTokens.PlatformInstaller, new ValueContainer(InjectTokens.PlatformInstaller, platformInstallerStub)],
        [InjectTokens.KeyManager, new ValueContainer(InjectTokens.KeyManager, keyManagerStub)],
        [InjectTokens.DependencyManager, new ValueContainer(InjectTokens.DependencyManager, depManagerStub)],
        [InjectTokens.Helm, new ValueContainer(InjectTokens.Helm, helmStub)],
      ]);

      resetForTest(undefined, undefined, true, containerOverrides);

      options = {};
      options.logger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

      options.configManager = container.resolve<ConfigManager>(InjectTokens.ConfigManager);
      options.configManager.update(argv.build());

      options.k8Factory = k8SFactoryStub;
      const k8Stub = sinon.stub();

      options.k8Factory.default = sinon.stub().returns(k8Stub);
      options.k8Factory.default().namespaces = sinon.stub().returns({
        has: sinon.stub().returns(true),
      });
      options.k8Factory.default().contexts = sinon.stub().returns({
        readCurrent: sinon.stub().returns(new K8Client(undefined).contexts().readCurrent()),
      });
      options.k8Factory.default().configMaps = sinon.stub() as unknown as K8ClientConfigMaps;
      options.k8Factory.default().configMaps.read = sinon.stub();
      options.k8Factory.default().pods = sinon.stub().returns({
        waitForRunningPhase: sinon.stub(),
        waitForReadyStatus: sinon.stub(),
      });
      options.k8Factory.default().leases = sinon.stub().returns({
        read: sinon.stub(),
      });
      options.k8Factory.default().logger = options.logger;

      options.k8Factory.getK8 = sinon.stub().returns(k8Stub);
      options.k8Factory.getK8().namespaces = sinon.stub().returns({
        has: sinon.stub().returns(true),
      });
      options.k8Factory.getK8().configMaps = sinon.stub() as unknown as K8ClientConfigMaps;
      options.k8Factory.getK8().configMaps.read = sinon.stub();
      options.k8Factory.getK8().pods = sinon.stub().returns({
        waitForRunningPhase: sinon.stub(),
        waitForReadyStatus: sinon.stub(),
      });
      options.k8Factory.getK8().leases = sinon.stub().returns({
        read: sinon.stub(),
      });
      options.k8Factory.getK8().logger = options.logger;

      options.k8Factory.default().clusters = sinon.stub().returns({
        list: sinon.stub().returns([{name: 'solo-e2e'}]),
      });
      options.k8Factory.default().clusters().readCurrent = sinon.stub().returns('solo-e2e');

      clusterChecksStub.isMinioInstalled = sinon.stub();
      clusterChecksStub.isPrometheusInstalled = sinon.stub();
      clusterChecksStub.isCertManagerInstalled = sinon.stub();
      container.registerInstance(InjectTokens.ClusterChecks, clusterChecksStub);

      container.registerInstance(InjectTokens.K8Factory, options.k8Factory);

      options.depManager = sinon.stub() as unknown as DependencyManager;
      container.registerInstance<DependencyManager>(InjectTokens.DependencyManager, options.depManager);
      options.localConfig = container.resolve<LocalConfigRuntimeState>(InjectTokens.LocalConfigRuntimeState);
      options.helm = container.resolve<DefaultHelmClient>(InjectTokens.Helm);
      options.helm.dependency = sinon.stub();

      ListrLock.newAcquireLockTask = sinon.stub().returns({
        run: sinon.stub().returns({}),
      });

      options.keyManager = container.resolve<KeyManager>(InjectTokens.KeyManager);
      options.keyManager.prepareTlsKeyFilePaths = sinon.stub();
      options.keyManager.copyGossipKeysToStaging = sinon.stub();
      options.keyManager.copyNodeKeysToStaging = sinon.stub();

      options.platformInstaller = platformInstallerStub;
      options.platformInstaller.copyNodeKeys = sinon.stub();
      container.registerInstance(InjectTokens.PlatformInstaller, options.platformInstaller);

      options.profileManager = container.resolve<ProfileManager>(InjectTokens.ProfileManager);
      options.profileManager.prepareValuesForSoloChart = sinon.stub();

      options.certificateManager = certificateManagerStub;
      container.registerInstance(InjectTokens.CertificateManager, options.certificateManager);

      options.chartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
      options.chartManager.isChartInstalled = sinon.stub().returns(true);
      options.chartManager.isChartInstalled.onSecondCall().returns(false);
      options.chartManager.upgrade = sinon.stub().returns(true);
      options.chartManager.uninstall = sinon.stub().returns(true);

      options.remoteConfig = container.resolve<RemoteConfigRuntimeState>(InjectTokens.RemoteConfigRuntimeState);
      options.remoteConfig.isLoaded = sinon.stub().returns(true);
      options.remoteConfig.getConfigMap = sinon.stub().returns(null);
      options.remoteConfig.persist = sinon.stub();
      options.remoteConfig.loadAndValidate = sinon.stub();
      options.remoteConfig.getNamespace = sinon.stub();

      options.remoteConfig.configuration = {
        components: {changeNodePhase: sinon.stub(), getNewComponentId: sinon.stub(), addNewComponent: sinon.stub()},
      };

      await options.localConfig.load();
      options.localConfig.configuration.clusterRefs.set('solo-e2e', new StringFacade('context-1'));

      options.leaseManager = container.resolve<LockManager>(InjectTokens.LockManager);
      options.leaseManager.currentNamespace = sinon.stub().returns(testName);

      GenesisNetworkDataConstructor.initialize = sinon.stub().returns(null);
    });

    afterEach(() => {
      sinon.restore();
    });

    it('Install function is called with expected parameters', async () => {
      try {
        const networkCommand = container.resolve<NetworkCommand>(NetworkCommand);
        options.remoteConfig.getConsensusNodes = sinon.stub().returns([{name: 'node1'}]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context1']);
        const stubbedClusterReferences: ClusterReferences = new Map<string, string>([['solo-e2e', 'context1']]);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(stubbedClusterReferences);

        // @ts-expect-error - TS2341: to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);

        // @ts-expect-error - TS2341: to access private property
        await networkCommand.deploy(argv.build());

        expect(options.chartManager.upgrade.args[0][0].name).to.equal('solo-e2e');
        expect(options.chartManager.upgrade.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(options.chartManager.upgrade.args[0][2]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(options.chartManager.upgrade.args[0][3]).to.equal(constants.SOLO_TESTING_CHART_URL);
      } finally {
        sinon.restore();
      }
    });

    it('Should use local chart directory', async () => {
      try {
        argv.setArg(flags.chartDirectory, 'test-directory');
        argv.setArg(flags.force, true);
        const networkCommand = container.resolve<NetworkCommand>(NetworkCommand);

        options.remoteConfig.getConsensusNodes = sinon.stub().returns([{name: 'node1'}]);
        options.remoteConfig.getContexts = sinon.stub().returns(['context1']);
        const stubbedClusterReferences: ClusterReferences = new Map<string, string>([['solo-e2e', 'context1']]);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(stubbedClusterReferences);

        // @ts-expect-error - TS2341: to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);

        // @ts-expect-error - TS2341: to access private property
        await networkCommand.deploy(argv.build());
        expect(options.chartManager.upgrade.args[0][0].name).to.equal('solo-e2e');
        expect(options.chartManager.upgrade.args[0][1]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(options.chartManager.upgrade.args[0][2]).to.equal(constants.SOLO_DEPLOYMENT_CHART);
        expect(options.chartManager.upgrade.args[0][3]).to.equal(PathEx.join(ROOT_DIR, 'test-directory'));
      } finally {
        sinon.restore();
      }
    });

    it('Should use prepare config correctly for all clusters', async () => {
      try {
        const common = PathEx.join('test', 'data', 'test-values.yaml');
        const values1 = PathEx.join('test', 'data', 'test-values1.yaml');
        const values2 = PathEx.join('test', 'data', 'test-values2.yaml');
        argv.setArg(flags.networkDeploymentValuesFile, `${common},cluster=${values1},cluster=${values2}`);
        argv.setArg(flags.chartDirectory, 'test-directory');
        argv.setArg(flags.force, true);

        const task = sinon.stub();

        options.remoteConfig.getConsensusNodes = sinon
          .stub()
          .returns([new ConsensusNode('node1', 0, 'solo-e2e', 'cluster', 'context-1', 'base', 'pattern', 'fqdn')]);

        options.remoteConfig.getContexts = sinon.stub().returns(['context-1']);
        const stubbedClusterReferences: ClusterReferences = new Map<string, string>([['cluster', 'context1']]);
        options.remoteConfig.getClusterRefs = sinon.stub().returns(stubbedClusterReferences);

        const networkCommand = container.resolve<NetworkCommand>(NetworkCommand);
        // @ts-expect-error - to mock
        networkCommand.getBlockNodes = sinon.stub().returns([]);

        // @ts-expect-error - to access private method
        const config: NetworkDeployConfigClass = await networkCommand.prepareConfig(task, argv.build());

        expect(config.valuesArgMap).to.not.empty;
        expect(config.valuesArgMap['cluster']).to.not.empty;
        expect(config.valuesArgMap['cluster'].indexOf(PathEx.join('solo-deployment', 'values.yaml'))).to.not.equal(-1);
        expect(config.valuesArgMap['cluster'].indexOf('values.yaml')).to.not.equal(-1);
        expect(config.valuesArgMap['cluster'].indexOf('test-values1.yaml')).to.not.equal(-1);
        expect(config.valuesArgMap['cluster'].indexOf('test-values2.yaml')).to.not.equal(-1);

        // chart values file should precede the values file passed in the command
        expect(config.valuesArgMap['cluster'].indexOf('solo-deployment/values.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values1.yaml'),
        );
        expect(config.valuesArgMap['cluster'].indexOf('solo-deployment/values.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values2.yaml'),
        );

        expect(config.valuesArgMap['cluster'].indexOf('values.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values1.yaml'),
        );
        expect(config.valuesArgMap['cluster'].indexOf('test-values1.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values2.yaml'),
        );
        expect(config.valuesArgMap['cluster'].indexOf('values.yaml')).to.be.lt(
          config.valuesArgMap['cluster'].indexOf('test-values2.yaml'),
        );
      } finally {
        sinon.restore();
      }
    });
  });
});
