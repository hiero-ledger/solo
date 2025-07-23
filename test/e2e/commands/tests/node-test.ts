// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {main} from '../../../../src/index.js';
import {type ClusterReferences, type DeploymentName} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
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
} from '@hashgraph/sdk';
import {type BaseTestOptions} from './base-test-options.js';

export class NodeTest extends BaseCommandTest {
  private static soloNodeKeysArgv(testName: string, deployment: DeploymentName): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeTest;

    const argv: string[] = newArgv();
    argv.push(
      'node',
      'keys',
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

    it(`${testName}: node keys`, async (): Promise<void> => {
      testLogger.info(`${testName}: beginning node keys command`);
      await main(soloNodeKeysArgv(testName, deployment));
      const node1Key: Buffer = fs.readFileSync(
        PathEx.joinWithRealPath(testCacheDirectory, 'keys', 's-private-node1.pem'),
      );
      expect(node1Key).to.not.be.null;
      testLogger.info(`${testName}: finished node keys command`);
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
    argv.push('node', 'setup', optionFromFlag(Flags.deployment), deployment);
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

    it(`${testName}: node setup`, async (): Promise<void> => {
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
    argv.push('node', 'start', optionFromFlag(Flags.deployment), deployment);
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

    it(`${testName}: node start`, async (): Promise<void> => {
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
}
