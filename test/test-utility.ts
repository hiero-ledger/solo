// SPDX-License-Identifier: Apache-2.0

import 'chai-as-promised';

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';
import 'dotenv/config';

import fs from 'node:fs';
import os from 'node:os';
import {Flags as flags} from '../src/commands/flags.js';
import {ClusterCommand} from '../src/commands/cluster/index.js';
import {InitCommand} from '../src/commands/init/init.js';
import {NetworkCommand} from '../src/commands/network.js';
import {NodeCommand} from '../src/commands/node/index.js';
import {type DependencyManager} from '../src/core/dependency-managers/index.js';
import {sleep} from '../src/core/helpers.js';
import {
  AccountBalanceQuery,
  AccountCreateTransaction,
  type AccountId,
  Hbar,
  HbarUnit,
  PrivateKey,
} from '@hashgraph/sdk';
import * as constants from '../src/core/constants.js';
import {NODE_LOG_FAILURE_MSG, ROOT_CONTAINER, SOLO_LOGS_DIR} from '../src/core/constants.js';
import crypto from 'node:crypto';
import {type AccountCommand} from '../src/commands/account.js';
import {type SoloLogger} from '../src/core/logging/solo-logger.js';
import {type NodeAlias} from '../src/types/aliases.js';
import {type K8Factory} from '../src/integration/kube/k8-factory.js';
import {type AccountManager} from '../src/core/account-manager.js';
import {type PlatformInstaller} from '../src/core/platform-installer.js';
import {type ProfileManager} from '../src/core/profile-manager.js';
import {type LockManager} from '../src/core/lock/lock-manager.js';
import {type CertificateManager} from '../src/core/certificate-manager.js';
import {Templates} from '../src/core/templates.js';
import {type ConfigManager} from '../src/core/config-manager.js';
import {type ChartManager} from '../src/core/chart-manager.js';
import {type PackageDownloader} from '../src/core/package-downloader.js';
import {type KeyManager} from '../src/core/key-manager.js';

import {Duration} from '../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from './test-container.js';
import {NamespaceName} from '../src/types/namespace/namespace-name.js';
import {PodReference} from '../src/integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../src/integration/kube/resources/container/container-reference.js';
import {type NetworkNodes} from '../src/core/network-nodes.js';
import {InjectTokens} from '../src/core/dependency-injection/inject-tokens.js';
import {DeploymentCommand} from '../src/commands/deployment.js';
import {Argv} from './helpers/argv-wrapper.js';
import {type ClusterReferenceName, type DeploymentName, type NamespaceNameAsString} from '../src/types/index.js';
import {type CommandInvoker} from './helpers/command-invoker.js';
import {PathEx} from '../src/business/utils/path-ex.js';
import {type HelmClient} from '../src/integration/helm/helm-client.js';
import {type NodeServiceMapping} from '../src/types/mappings/node-service-mapping.js';
import {TEST_LOCAL_HEDERA_PLATFORM_VERSION} from '../version-test.js';
import {HEDERA_PLATFORM_VERSION} from '../version.js';
import {gte as semVersionGte} from 'semver';
import {type LocalConfigRuntimeState} from '../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type InstanceOverrides} from '../src/core/dependency-injection/container-init.js';
import {type RemoteConfigRuntimeStateApi} from '../src/business/runtime-state/api/remote-config-runtime-state-api.js';

export const BASE_TEST_DIR = PathEx.join('test', 'data', 'tmp');

export function getTestCluster(): ClusterReferenceName {
  const soloTestCluster: ClusterReferenceName =
    process.env.SOLO_TEST_CLUSTER ||
    container.resolve<K8Factory>(InjectTokens.K8Factory).default().clusters().readCurrent() ||
    'solo-e2e';

  return soloTestCluster.startsWith('kind-') ? soloTestCluster : `kind-${soloTestCluster}`;
}

export function getTestLogger() {
  return container.resolve<SoloLogger>(InjectTokens.SoloLogger);
}

export function getTestCacheDirectory(testName?: string) {
  const d = testName ? PathEx.join(BASE_TEST_DIR, testName) : BASE_TEST_DIR;

  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, {recursive: true});
  }
  return d;
}

export function getTemporaryDirectory() {
  return fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-'));
}

export function deployNetworkTest(argv: Argv, commandInvoker: CommandInvoker, networkCmd: NetworkCommand): void {
  it('should succeed with network deploy', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: NetworkCommand.COMMAND_NAME,
      subcommand: 'deploy',
      // @ts-expect-error - to access private property
      callback: async argv => networkCmd.deploy(argv),
    });
  }).timeout(Duration.ofMinutes(5).toMillis());
}

export function startNodesTest(argv: Argv, commandInvoker: CommandInvoker, nodeCmd: NodeCommand): void {
  it('should succeed with node setup command', async () => {
    // cache this, because `solo node setup.finalize()` will reset it to false
    await commandInvoker.invoke({
      argv: argv,
      command: NodeCommand.COMMAND_NAME,
      subcommand: 'setup',
      callback: async argv => nodeCmd.handlers.setup(argv),
    });
  }).timeout(Duration.ofMinutes(4).toMillis());

  it('should succeed with node start command', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: NodeCommand.COMMAND_NAME,
      subcommand: 'start',
      callback: async argv => nodeCmd.handlers.start(argv),
    });
  }).timeout(Duration.ofMinutes(30).toMillis());

  it('node log command should work', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: NodeCommand.COMMAND_NAME,
      subcommand: 'logs',
      callback: async argv => nodeCmd.handlers.logs(argv),
    });

    const soloLogPath: string = PathEx.joinWithRealPath(SOLO_LOGS_DIR, 'solo.log');
    const soloLog: string = fs.readFileSync(soloLogPath, 'utf8');

    expect(soloLog, 'Check solo.log for stale errors from previous runs').to.not.have.string(NODE_LOG_FAILURE_MSG);
  }).timeout(Duration.ofMinutes(5).toMillis());
}

interface TestOptions {
  logger: SoloLogger;
  helm: HelmClient;
  k8Factory: K8Factory;
  chartManager: ChartManager;
  configManager: ConfigManager;
  downloader: PackageDownloader;
  platformInstaller: PlatformInstaller;
  depManager: DependencyManager;
  keyManager: KeyManager;
  accountManager: AccountManager;
  cacheDir: string;
  profileManager: ProfileManager;
  leaseManager: LockManager;
  certificateManager: CertificateManager;
  remoteConfig: RemoteConfigRuntimeStateApi;
  localConfig: LocalConfigRuntimeState;
  commandInvoker: CommandInvoker;
}

export interface BootstrapResponse {
  deployment: string;
  namespace: NamespaceName;
  opts: TestOptions;
  manager: {
    accountManager: AccountManager;
  };
  cmd: {
    initCmd: InitCommand;
    clusterCmd: ClusterCommand;
    networkCmd: NetworkCommand;
    nodeCmd: NodeCommand;
    accountCmd: AccountCommand;
    deploymentCmd: DeploymentCommand;
  };
}

interface Cmd {
  k8FactoryArg?: K8Factory;
  initCmdArg?: InitCommand;
  clusterCmdArg?: ClusterCommand;
  networkCmdArg?: NetworkCommand;
  nodeCmdArg?: NodeCommand;
  accountCmdArg?: AccountCommand;
  deploymentCmdArg?: DeploymentCommand;
  containerOverrides?: InstanceOverrides;
}

function getTestNamespace(argv: Argv): NamespaceName {
  return NamespaceName.of(argv.getArg<NamespaceNameAsString>(flags.namespace) || 'bootstrap-ns');
}

let shouldReset: boolean = true;

/** Initialize common test variables */
export function bootstrapTestVariables(
  testName: string,
  argv: Argv,
  {k8FactoryArg, initCmdArg, clusterCmdArg, networkCmdArg, nodeCmdArg, accountCmdArg, deploymentCmdArg}: Cmd,
): BootstrapResponse {
  const namespace: NamespaceName = getTestNamespace(argv);

  const deployment: string = argv.getArg<DeploymentName>(flags.deployment) || `${namespace.name}-deployment`;
  const cacheDirectory: string = argv.getArg<string>(flags.cacheDir) || getTestCacheDirectory(testName);

  // Make sure the container is reset only once per CI run.
  // When multiple test suites are loaded simultaneously, as is the case with `task test-e2e-standard`
  // the container will be reset multiple times, which causes issues with the loading of LocalConfigRuntimeState.
  // A better solution would be to run bootstrapping during the before hook of the test suite.
  if (shouldReset) {
    resetForTest(namespace.name, cacheDirectory);
    shouldReset = false;
  }
  const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
  configManager.update(argv.build());

  const downloader: PackageDownloader = container.resolve(InjectTokens.PackageDownloader);
  const depManager: DependencyManager = container.resolve(InjectTokens.DependencyManager);
  const helm: HelmClient = container.resolve(InjectTokens.Helm);
  const chartManager: ChartManager = container.resolve(InjectTokens.ChartManager);
  const keyManager: KeyManager = container.resolve(InjectTokens.KeyManager);
  const k8Factory: K8Factory = k8FactoryArg || container.resolve(InjectTokens.K8Factory);
  const accountManager: AccountManager = container.resolve(InjectTokens.AccountManager);
  const platformInstaller: PlatformInstaller = container.resolve(InjectTokens.PlatformInstaller);
  const profileManager: ProfileManager = container.resolve(InjectTokens.ProfileManager);
  const leaseManager: LockManager = container.resolve(InjectTokens.LockManager);
  const certificateManager: CertificateManager = container.resolve(InjectTokens.CertificateManager);
  const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
  const remoteConfig: RemoteConfigRuntimeStateApi = container.resolve(InjectTokens.RemoteConfigRuntimeState);
  const testLogger: SoloLogger = getTestLogger();
  const commandInvoker = container.resolve(InjectTokens.CommandInvoker) as CommandInvoker;

  const options: TestOptions = {
    logger: testLogger,
    helm,
    k8Factory,
    chartManager,
    configManager,
    downloader,
    platformInstaller,
    depManager,
    keyManager,
    accountManager,
    cacheDir: cacheDirectory,
    profileManager,
    leaseManager,
    certificateManager,
    localConfig,
    remoteConfig,
    commandInvoker,
  };

  return {
    namespace,
    deployment,
    opts: options,
    manager: {
      accountManager,
    },
    cmd: {
      initCmd: initCmdArg || container.resolve(InjectTokens.InitCommand),
      clusterCmd: clusterCmdArg || container.resolve(InjectTokens.ClusterCommand),
      networkCmd: networkCmdArg || container.resolve(InjectTokens.NetworkCommand),
      nodeCmd: nodeCmdArg || container.resolve(InjectTokens.NodeCommand),
      accountCmd: accountCmdArg || container.resolve(InjectTokens.AccountCommand),
      deploymentCmd: deploymentCmdArg || container.resolve(InjectTokens.DeploymentCommand),
    },
  };
}

/** Bootstrap network in a given namespace, then run the test call back providing the bootstrap response */
export function endToEndTestSuite(
  testName: string,
  argv: Argv,
  {
    k8FactoryArg,
    initCmdArg,
    clusterCmdArg,
    networkCmdArg,
    nodeCmdArg,
    accountCmdArg,
    startNodes,
    containerOverrides,
    deployNetwork,
  }: Cmd & {startNodes?: boolean; deployNetwork?: boolean},
  testsCallBack: (bootstrapResp: BootstrapResponse) => void = () => {},
): void {
  const testLogger: SoloLogger = getTestLogger();
  const testNamespace: NamespaceName = getTestNamespace(argv);
  resetForTest(testNamespace.name, undefined, false, containerOverrides);
  if (typeof startNodes !== 'boolean') {
    startNodes = true;
  }
  if (typeof deployNetwork !== 'boolean') {
    deployNetwork = true;
  }

  const bootstrapResp = bootstrapTestVariables(testName, argv, {
    k8FactoryArg,
    initCmdArg,
    clusterCmdArg,
    networkCmdArg,
    nodeCmdArg,
    accountCmdArg,
  });

  const {
    namespace,
    cmd: {initCmd, clusterCmd, networkCmd, nodeCmd, deploymentCmd},
    opts: {k8Factory, chartManager, commandInvoker},
  } = bootstrapResp;

  describe(`E2E Test Suite for '${testName}'`, function () {
    before(async (): Promise<void> => {
      const localConfig = container.resolve<LocalConfigRuntimeState>(InjectTokens.LocalConfigRuntimeState);
      await localConfig.load();
    });

    this.bail(true); // stop on first failure, nothing else will matter if network doesn't come up correctly

    describe(`Bootstrap network for test [release ${argv.getArg<string>(flags.releaseTag)}]`, () => {
      before(() => {
        testLogger.showUser(`------------------------- START: bootstrap (${testName}) ----------------------------`);
      });

      // TODO: add rest of prerequisites for setup

      after(async function () {
        this.timeout(Duration.ofMinutes(5).toMillis());
        await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
        testLogger.showUser(`------------------------- END: bootstrap (${testName}) ----------------------------`);
      });

      it('should cleanup previous deployment', async () => {
        await commandInvoker.invoke({
          argv: argv,
          command: InitCommand.COMMAND_NAME,
          callback: async argv => initCmd.init(argv),
        });

        if (await k8Factory.default().namespaces().has(namespace)) {
          await k8Factory.default().namespaces().delete(namespace);

          while (await k8Factory.default().namespaces().has(namespace)) {
            testLogger.debug(`Namespace ${namespace} still exist. Waiting...`);
            await sleep(Duration.ofSeconds(2));
          }
        }

        if (
          !(await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART))
        ) {
          await commandInvoker.invoke({
            argv: argv,
            command: ClusterCommand.COMMAND_NAME,
            subcommand: 'setup',
            callback: async argv => clusterCmd.handlers.setup(argv),
          });
        }
      }).timeout(Duration.ofMinutes(2).toMillis());

      it("should success with 'cluster-ref connect'", async () => {
        const localConfig = container.resolve<LocalConfigRuntimeState>(InjectTokens.LocalConfigRuntimeState);
        await localConfig.load();
        await commandInvoker.invoke({
          argv: argv,
          command: ClusterCommand.COMMAND_NAME,
          subcommand: 'connect',
          callback: async argv => clusterCmd.handlers.connect(argv),
        });
      });

      it('should succeed with deployment create', async () => {
        await commandInvoker.invoke({
          argv: argv,
          command: DeploymentCommand.COMMAND_NAME,
          subcommand: 'create',
          callback: async argv => deploymentCmd.create(argv),
        });
      });

      it("should succeed with 'deployment add-cluster'", async () => {
        await commandInvoker.invoke({
          argv: argv,
          command: DeploymentCommand.COMMAND_NAME,
          subcommand: 'add-cluster',
          callback: async argv => deploymentCmd.addCluster(argv),
        });
      });

      it('generate key files', async () => {
        const localConfig = container.resolve(InjectTokens.LocalConfigRuntimeState);
        await commandInvoker.invoke({
          argv: argv,
          command: NodeCommand.COMMAND_NAME,
          subcommand: 'keys',
          callback: async argv => nodeCmd.handlers.keys(argv),
        });
      }).timeout(Duration.ofMinutes(2).toMillis());

      if (deployNetwork) {
        deployNetworkTest(argv, commandInvoker, networkCmd);
      }

      if (startNodes) {
        startNodesTest(argv, commandInvoker, nodeCmd);
      }
    });

    describe(testName, () => {
      testsCallBack(bootstrapResp);
    });
  });
}

export function balanceQueryShouldSucceed(
  accountManager: AccountManager,
  namespace: NamespaceName,
  remoteConfig: RemoteConfigRuntimeStateApi,
  logger: SoloLogger,
  skipNodeAlias?: NodeAlias,
): void {
  it('Balance query should succeed', async () => {
    try {
      const argv = Argv.getDefaultArgv(namespace);
      expect(accountManager._nodeClient).to.be.null;

      await accountManager.refreshNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        skipNodeAlias,
        argv.getArg<DeploymentName>(flags.deployment),
      );
      expect(accountManager._nodeClient).not.to.be.null;

      const balance = await new AccountBalanceQuery()
        .setAccountId(accountManager._nodeClient.getOperator().accountId)
        .execute(accountManager._nodeClient);

      expect(balance.hbars).not.be.null;
    } catch (error) {
      logger.showUserError(error);
      expect.fail();
    }
    await sleep(Duration.ofSeconds(1));
  }).timeout(Duration.ofMinutes(2).toMillis());
}

export function accountCreationShouldSucceed(
  accountManager: AccountManager,
  namespace: NamespaceName,
  remoteConfig: RemoteConfigRuntimeStateApi,
  logger: SoloLogger,
  skipNodeAlias?: NodeAlias,
  expectedAccountId?: AccountId,
): void {
  it(
    'Account creation should succeed' +
      (expectedAccountId ? ` with expected AccountId: ${expectedAccountId.toString()}` : ''),
    async () => {
      try {
        const argv = Argv.getDefaultArgv(namespace);
        await accountManager.refreshNodeClient(
          namespace,
          remoteConfig.getClusterRefs(),
          skipNodeAlias,
          argv.getArg<DeploymentName>(flags.deployment),
        );
        expect(accountManager._nodeClient).not.to.be.null;
        const privateKey = PrivateKey.generate();
        const amount = 100;

        const newAccount = await new AccountCreateTransaction()
          .setKey(privateKey)
          .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
          .execute(accountManager._nodeClient);

        // Get the new account ID
        const getReceipt = await newAccount.getReceipt(accountManager._nodeClient);
        const accountInfo = {
          accountId: getReceipt.accountId.toString(),
          privateKey: privateKey.toString(),
          publicKey: privateKey.publicKey.toString(),
          balance: amount,
        };

        expect(accountInfo.accountId).not.to.be.null;
        if (expectedAccountId) {
          expect(accountInfo.accountId).to.equal(expectedAccountId.toString());
        }
        expect(accountInfo.balance).to.equal(amount);
      } catch (error) {
        logger.showUserError(error);
        expect.fail();
      }
    },
  ).timeout(Duration.ofMinutes(2).toMillis());
}

export async function getNodeAliasesPrivateKeysHash(
  networkNodeServicesMap: NodeServiceMapping,
  k8Factory: K8Factory,
  destinationDirectory: string,
) {
  const dataKeysDirectory = `${constants.HEDERA_HAPI_PATH}/data/keys`;
  const tlsKeysDirectory = constants.HEDERA_HAPI_PATH;
  const nodeKeyHashMap = new Map<NodeAlias, Map<string, string>>();
  for (const networkNodeServices of networkNodeServicesMap.values()) {
    const keyHashMap = new Map<string, string>();
    const nodeAlias = networkNodeServices.nodeAlias;
    const uniqueNodeDestinationDirectory = PathEx.join(destinationDirectory, nodeAlias);
    if (!fs.existsSync(uniqueNodeDestinationDirectory)) {
      fs.mkdirSync(uniqueNodeDestinationDirectory, {recursive: true});
    }
    await addKeyHashToMap(
      networkNodeServices.namespace,
      k8Factory,
      nodeAlias,
      dataKeysDirectory,
      uniqueNodeDestinationDirectory,
      keyHashMap,
      Templates.renderGossipPemPrivateKeyFile(nodeAlias),
    );
    await addKeyHashToMap(
      networkNodeServices.namespace,
      k8Factory,
      nodeAlias,
      tlsKeysDirectory,
      uniqueNodeDestinationDirectory,
      keyHashMap,
      'hedera.key',
    );
    nodeKeyHashMap.set(nodeAlias, keyHashMap);
  }
  return nodeKeyHashMap;
}

async function addKeyHashToMap(
  namespace: NamespaceName,
  k8Factory: K8Factory,
  nodeAlias: NodeAlias,
  keyDirectory: string,
  uniqueNodeDestinationDirectory: string,
  keyHashMap: Map<string, string>,
  privateKeyFileName: string,
): Promise<void> {
  await k8Factory
    .default()
    .containers()
    .readByRef(
      ContainerReference.of(PodReference.of(namespace, Templates.renderNetworkPodName(nodeAlias)), ROOT_CONTAINER),
    )
    .copyFrom(PathEx.join(keyDirectory, privateKeyFileName), uniqueNodeDestinationDirectory);
  const keyBytes = fs.readFileSync(PathEx.joinWithRealPath(uniqueNodeDestinationDirectory, privateKeyFileName));
  const keyString = keyBytes.toString();
  keyHashMap.set(privateKeyFileName, crypto.createHash('sha256').update(keyString).digest('base64'));
}

export const testLocalConfigData = {
  userIdentity: {
    name: 'john',
    host: 'doe',
  },
  soloVersion: '1.0.0',
  deployments: {
    deployment: {
      clusters: ['cluster-1'],
      namespace: 'solo-e2e',
      realm: 0,
      shard: 0,
    },
    'deployment-2': {
      clusters: ['cluster-2'],
      namespace: 'solo-2',
      realm: 0,
      shard: 0,
    },
    'deployment-3': {
      clusters: ['cluster-3'],
      namespace: 'solo-3',
      realm: 0,
      shard: 0,
    },
  },
  clusterRefs: {
    'cluster-1': 'context-1',
    'cluster-2': 'context-2',
  },
};

export {HEDERA_PLATFORM_VERSION as HEDERA_PLATFORM_VERSION_TAG} from '../version.js';

export function hederaPlatformSupportsNonZeroRealms() {
  return semVersionGte(HEDERA_PLATFORM_VERSION.slice(1), '0.61.4');
}

export function localHederaPlatformSupportsNonZeroRealms() {
  return semVersionGte(TEST_LOCAL_HEDERA_PLATFORM_VERSION.slice(1), '0.61.4');
}
