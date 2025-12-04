// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {
  type ClusterReferenceName,
  type ClusterReferences,
  type DeploymentName,
  type SoloListrTaskWrapper,
} from '../../../../src/types/index.js';
import {Flags as flags, Flags} from '../../../../src/commands/flags.js';
import fs from 'node:fs';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {expect} from 'chai';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {HEDERA_HAPI_PATH, HEDERA_USER_HOME_DIR, ROOT_CONTAINER} from '../../../../src/core/constants.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {Templates} from '../../../../src/core/templates.js';
import * as constants from '../../../../src/core/constants.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type AccountManager} from '../../../../src/core/account-manager.js';
import {
  AccountCreateTransaction,
  Hbar,
  HbarUnit,
  PrivateKey,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {type BaseTestOptions} from './base-test-options.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {DeploymentCommandDefinition} from '../../../../src/commands/command-definitions/deployment-command-definition.js';
import {KeysCommandDefinition} from '../../../../src/commands/command-definitions/keys-command-definition.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';
import {sleep} from '../../../../src/core/helpers.js';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {it} from 'mocha';
import {createAccount, queryBalance} from '../../../test-utility.js';
import {type RemoteConfigRuntimeState} from '../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';

export class NodeTest extends BaseCommandTest {
  private static soloNodeKeysArgv(testName: string, deployment: DeploymentName): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;

    const argv: string[] = newArgv();
    argv.push(
      KeysCommandDefinition.COMMAND_NAME,
      KeysCommandDefinition.CONSENSUS_SUBCOMMAND_NAME,
      KeysCommandDefinition.CONSENSUS_GENERATE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.generateGossipKeys),
      'true',
      optionFromFlag(Flags.generateTlsKeys),
    );
    argvPushGlobalFlags(argv, testName, true);
    return argv;
  }

  public static keys(options: BaseTestOptions): void {
    const {testName, testLogger, deployment, testCacheDirectory} = options;
    const {soloNodeKeysArgv} = NodeTest;

    it(`${testName}: keys consensus generate`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning keys consensus generate command`);
      await main(soloNodeKeysArgv(testName, deployment));
      const node1Key: Buffer = fs.readFileSync(
        PathEx.joinWithRealPath(testCacheDirectory, 'keys', 's-private-node1.pem'),
      );
      expect(node1Key).to.not.be.null;
      testLogger.info(`${testName}: finished keys consensus generate command`);
    });
  }

  private static soloNodeSetupArgv(
    testName: string,
    deployment: DeploymentName,
    enableLocalBuildPathTesting: boolean,
    localBuildPath: string,
    localBuildReleaseTag: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_SETUP,
      optionFromFlag(Flags.deployment),
      deployment,
    );
    if (enableLocalBuildPathTesting) {
      argv.push(
        optionFromFlag(Flags.localBuildPath),
        localBuildPath,
        optionFromFlag(Flags.releaseTag),
        localBuildReleaseTag,
      );
    }
    argvPushGlobalFlags(argv, testName, true);
    return argv;
  }

  private static soloNodeAddArgv(options: BaseTestOptions, useFqdn: boolean = true): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;
    const {testName} = options;

    const firstClusterReference: ClusterReferenceName = [...options.clusterReferences.keys()][0];

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_ADD,
      optionFromFlag(Flags.deployment),
      options.deployment,
      optionFromFlag(flags.persistentVolumeClaims),
      optionFromFlag(Flags.clusterRef),
      firstClusterReference,
      optionFromFlag(flags.generateGossipKeys),
      optionFromFlag(flags.generateTlsKeys),
    );

    if (options.enableLocalBuildPathTesting) {
      argv.push(
        optionFromFlag(Flags.localBuildPath),
        options.localBuildPath,
        optionFromFlag(Flags.releaseTag),
        options.localBuildReleaseTag,
      );
    }

    if (!useFqdn) {
      argv.push(optionFromFlag(Flags.endpointType), constants.ENDPOINT_TYPE_IP);
    }

    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static soloNodeUpdateArgv(options: BaseTestOptions, useFqdn: boolean = true): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;
    const {
      testName,
      deployment,
      enableLocalBuildPathTesting,
      localBuildPath,
      localBuildReleaseTag,
      consensusNodesCount,
    } = options;

    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(consensusNodesCount + 1);

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_UPDATE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAlias),
      nodeAlias,
    );

    if (enableLocalBuildPathTesting) {
      argv.push(
        optionFromFlag(Flags.localBuildPath),
        localBuildPath,
        optionFromFlag(Flags.releaseTag),
        localBuildReleaseTag,
      );
    }

    if (!useFqdn) {
      argv.push(optionFromFlag(Flags.endpointType), constants.ENDPOINT_TYPE_IP);
    }

    argvPushGlobalFlags(argv, testName, true);
    return argv;
  }

  private static soloNodeDestroyArgv(options: BaseTestOptions): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;
    const {
      testName,
      deployment,
      consensusNodesCount,
      enableLocalBuildPathTesting,
      localBuildPath,
      localBuildReleaseTag,
    } = options;

    const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(consensusNodesCount + 1);

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.nodeAlias),
      nodeAlias,
      optionFromFlag(flags.force),
      optionFromFlag(flags.quiet),
    );

    if (enableLocalBuildPathTesting) {
      argv.push(
        optionFromFlag(Flags.localBuildPath),
        localBuildPath,
        optionFromFlag(Flags.releaseTag),
        localBuildReleaseTag,
      );
    }

    argvPushGlobalFlags(argv, testName, true);
    return argv;
  }

  private static soloDiagnosticsConnectionsArgv(options: BaseTestOptions): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;
    const {testName, deployment} = options;

    const argv: string[] = newArgv();
    argv.push(
      DeploymentCommandDefinition.COMMAND_NAME,
      DeploymentCommandDefinition.DIAGNOSTIC_SUBCOMMAND_NAME,
      DeploymentCommandDefinition.DIAGNOSTIC_CONNECTIONS,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.quiet),
    );

    argvPushGlobalFlags(argv, testName, false);
    return argv;
  }

  private static soloNodeRefreshArgv(options: BaseTestOptions): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;
    const {testName, deployment, enableLocalBuildPathTesting, localBuildPath, localBuildReleaseTag} = options;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_REFRESH,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.quiet),
      optionFromFlag(flags.nodeAliasesUnparsed),
    );

    if (enableLocalBuildPathTesting) {
      argv.push(
        optionFromFlag(Flags.localBuildPath),
        localBuildPath,
        optionFromFlag(Flags.releaseTag),
        localBuildReleaseTag,
      );
    }

    argvPushGlobalFlags(argv, testName, true, true);

    return argv;
  }

  private static soloNodeStopArgv(options: BaseTestOptions, nodeAlias?: NodeAlias): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;
    const {testName, deployment} = options;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_STOP,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(flags.quiet),
    );

    if (nodeAlias) {
      argv.push(optionFromFlag(Flags.nodeAliasesUnparsed), nodeAlias);
    }

    argvPushGlobalFlags(argv, testName, false);
    return argv;
  }

  public static setup(options: BaseTestOptions): void {
    const {
      testName,
      deployment,
      namespace,
      contexts,
      enableLocalBuildPathTesting,
      localBuildPath,
      localBuildReleaseTag,
    } = options;
    const {soloNodeSetupArgv} = NodeTest;

    it(`${testName}: consensus node setup`, async (): Promise<void> => {
      await main(
        soloNodeSetupArgv(testName, deployment, enableLocalBuildPathTesting, localBuildPath, localBuildReleaseTag),
      );
      const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
      for (const context_ of contexts) {
        const k8: K8 = k8Factory.getK8(context_);
        const pods: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
        expect(pods, 'expect this cluster to have one network node').to.have.lengthOf(1);
        const rootContainer: ContainerReference = ContainerReference.of(
          PodReference.of(namespace, pods[0].podReference.name),
          ROOT_CONTAINER,
        );
        if (!enableLocalBuildPathTesting) {
          expect(
            await k8.containers().readByRef(rootContainer).hasFile(`${HEDERA_USER_HOME_DIR}/extract-platform.sh`),
            'expect extract-platform.sh to be present on the pods',
          ).to.be.true;
        }
        expect(await k8.containers().readByRef(rootContainer).hasFile(`${HEDERA_HAPI_PATH}/data/apps/HederaNode.jar`))
          .to.be.true;
        expect(
          await k8
            .containers()
            .readByRef(rootContainer)
            .hasFile(`${HEDERA_HAPI_PATH}/data/config/genesis-network.json`),
        ).to.be.true;
        expect(
          await k8
            .containers()
            .readByRef(rootContainer)
            .execContainer(['bash', '-c', `ls -al ${HEDERA_HAPI_PATH} | grep output`]),
        ).to.includes('hedera');
      }
    }).timeout(Duration.ofMinutes(2).toMillis());
  }

  private static soloNodeStartArgv(testName: string, deployment: DeploymentName): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_START,
      optionFromFlag(Flags.deployment),
      deployment,
    );
    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  private static async verifyAccountCreateWasSuccessful(
    namespace: NamespaceName,
    clusterReferences: ClusterReferences,
    deployment: DeploymentName,
  ): Promise<string> {
    const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
    try {
      await accountManager.refreshNodeClient(namespace, clusterReferences, undefined, deployment);
      expect(accountManager._nodeClient).not.to.be.null;
      const privateKey: PrivateKey = PrivateKey.generate();
      const amount: number = 777;

      const newAccount: TransactionResponse = await new AccountCreateTransaction()
        .setKeyWithoutAlias(privateKey)
        .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
        .execute(accountManager._nodeClient);

      // Get the new account ID
      const getReceipt: TransactionReceipt = await newAccount.getReceipt(accountManager._nodeClient);
      const accountInfo: {accountId: string; privateKey: string; balance: number; publicKey: string} = {
        accountId: getReceipt.accountId.toString(),
        privateKey: privateKey.toString(),
        publicKey: privateKey.publicKey.toString(),
        balance: amount,
      };

      expect(accountInfo.accountId).not.to.be.null;
      expect(accountInfo.balance).to.equal(amount);

      return accountInfo.accountId;
    } finally {
      await accountManager.close();
      expect(
        // @ts-expect-error - TS2341: Property _portForwards is private and only accessible within class AccountManager
        accountManager._portForwards,
        'port forwards should be empty after accountManager.close()',
      ).to.have.lengthOf(0);
    }
  }

  public static start(options: BaseTestOptions): void {
    const {testName, deployment, namespace, contexts, createdAccountIds, clusterReferences} = options;
    const {soloNodeStartArgv, verifyAccountCreateWasSuccessful} = NodeTest;

    it(`${testName}: consensus node start`, async (): Promise<void> => {
      await main(soloNodeStartArgv(testName, deployment));
      for (const context_ of contexts) {
        const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
        const k8: K8 = k8Factory.getK8(context_);
        const networkNodePod: Pod[] = await k8.pods().list(namespace, ['solo.hedera.com/type=network-node']);
        expect(networkNodePod).to.have.lengthOf(1);
        const haProxyPod: Pod[] = await k8
          .pods()
          .waitForReadyStatus(
            namespace,
            [
              `app=haproxy-${Templates.extractNodeAliasFromPodName(networkNodePod[0].podReference.name)}`,
              'solo.hedera.com/type=haproxy',
            ],
            constants.NETWORK_PROXY_MAX_ATTEMPTS,
            constants.NETWORK_PROXY_DELAY,
          );
        expect(haProxyPod).to.have.lengthOf(1);
        createdAccountIds.push(
          await verifyAccountCreateWasSuccessful(namespace, clusterReferences, deployment),
          await verifyAccountCreateWasSuccessful(namespace, clusterReferences, deployment),
        );
      }
      // create one more account to make sure that the last one gets pushed to mirror node
      await verifyAccountCreateWasSuccessful(namespace, clusterReferences, deployment);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static add(options: BaseTestOptions, useFqdn: boolean = true): void {
    const {testName} = options;
    const {soloNodeAddArgv} = NodeTest;

    it(`${testName}: consensus node add`, async (): Promise<void> => {
      await main(soloNodeAddArgv(options, useFqdn));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static update(options: BaseTestOptions, useFqdn: boolean = true): void {
    const {testName} = options;
    const {soloNodeUpdateArgv} = NodeTest;

    it(`${testName}: consensus node update`, async (): Promise<void> => {
      await main(soloNodeUpdateArgv(options, useFqdn));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName} = options;
    const {soloNodeDestroyArgv} = NodeTest;

    it(`${testName}: consensus node destroy`, async (): Promise<void> => {
      await main(soloNodeDestroyArgv(options));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static async refresh(options: BaseTestOptions): Promise<void> {
    const {soloNodeRefreshArgv} = NodeTest;

    await main(soloNodeRefreshArgv(options));

    await sleep(Duration.ofSeconds(15)); // sleep to wait for node to finish starting
  }

  private static async verifyPodShouldBeRunning(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<void> {
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    await localConfig.load();

    const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
      InjectTokens.RemoteConfigRuntimeState,
    );

    await remoteConfig.load(namespace);

    const podName: string = await container
      .resolve(NodeCommandTasks)
      // @ts-expect-error - TS2341: to access private property
      .checkNetworkNodePod(namespace, nodeAlias)
      .then((pod): string => pod.name.toString());

    expect(podName).to.equal(`network-${nodeAlias}-0`);
  }

  private static async verifyPodShouldNotBeActive(namespace: NamespaceName, nodeAlias: NodeAlias): Promise<void> {
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    await localConfig.load();

    const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
      InjectTokens.RemoteConfigRuntimeState,
    );

    await remoteConfig.load(namespace);

    await expect(
      container
        .resolve(NodeCommandTasks)
        // @ts-expect-error - TS2341: to access private property
        ._checkNetworkNodeActiveness(namespace, nodeAlias, {title: ''} as SoloListrTaskWrapper<any>, '', undefined, 15),
    ).to.be.rejected;
  }

  public static PemKill(options: BaseTestOptions): void {
    const {namespace, testName, testLogger} = options;
    const {checkNetwork, soloNodeStopArgv, refresh, verifyPodShouldBeRunning, verifyPodShouldNotBeActive} = NodeTest;

    const nodeAlias: NodeAlias = 'node2';

    it(`${testName}: perform PEM kill`, async (): Promise<void> => {
      const context: ClusterReferenceName = [...options.clusterReferences.values()][1];

      const pods: Pod[] = await container
        .resolve<K8Factory>(InjectTokens.K8Factory)
        .getK8(context)
        .pods()
        .list(namespace, ['solo.hedera.com/type=network-node', `solo.hedera.com/node-name=${nodeAlias}`]);

      await container
        .resolve<K8Factory>(InjectTokens.K8Factory)
        .getK8(context)
        .pods()
        .readByReference(pods[0].podReference)
        .killPod();

      testLogger.showUser('Sleeping for 20 seconds');
      await sleep(Duration.ofSeconds(20)); // give time for node to stop and update its logs

      await verifyPodShouldBeRunning(namespace, nodeAlias);
      await verifyPodShouldNotBeActive(namespace, nodeAlias);
      // stop the node to shut off the auto-restart
      await main(soloNodeStopArgv(options, nodeAlias));

      await sleep(Duration.ofSeconds(20)); // give time for node to stop and update its logs

      await refresh(options);

      await checkNetwork(testName, namespace, testLogger);
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static PemStop(options: BaseTestOptions): void {
    const {namespace, testName, testLogger, consensusNodesCount, deployment} = options;
    const {
      checkNetwork,
      refresh,
      verifyPodShouldNotBeActive,
      verifyPodShouldBeRunning,
      soloNodeStartArgv,
      soloNodeStopArgv,
    } = NodeTest;

    const nodeAlias: NodeAlias = 'node2';

    it(`${testName}: perform PEM stop`, async (): Promise<void> => {
      await main(soloNodeStopArgv(options, nodeAlias));

      await sleep(Duration.ofSeconds(30)); // give time for node to stop and update its logs

      for (const nodeAlias of Templates.renderNodeAliasesFromCount(consensusNodesCount, 0)) {
        await verifyPodShouldBeRunning(namespace, nodeAlias);
        await verifyPodShouldNotBeActive(namespace, nodeAlias);
      }

      await refresh(options);

      await checkNetwork(testName, namespace, testLogger);

      await main(soloNodeStartArgv(testName, deployment));

      testLogger.showUser('Sleeping for 20 seconds');
      await sleep(Duration.ofSeconds(20));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  private static async checkNetwork(testName: string, namespace: NamespaceName, logger: SoloLogger): Promise<void> {
    const accountManager: AccountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
    const remoteConfig: RemoteConfigRuntimeState = container.resolve<RemoteConfigRuntimeState>(
      InjectTokens.RemoteConfigRuntimeState,
    );

    await remoteConfig.load(namespace);

    await queryBalance(accountManager, namespace, remoteConfig, logger);
    await createAccount(accountManager, namespace, remoteConfig, logger);
  }

  // TODO: I think this should be used, but it isn't being called
  public static connections(options: BaseTestOptions): void {
    const {testName} = options;
    const {soloDiagnosticsConnectionsArgv} = NodeTest;

    it(`${testName}: deployment diagnostics connections`, async (): Promise<void> => {
      await main(soloDiagnosticsConnectionsArgv(options));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }
}
