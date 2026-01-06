// SPDX-License-Identifier: Apache-2.0

import {describe} from 'mocha';
import {expect} from 'chai';

import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import * as constants from '../../../src/core/constants.js';
import {Duration} from '../../../src/core/time/duration.js';
import {sleep} from '../../../src/core/helpers.js';
import {EndToEndTestSuiteBuilder} from '../end-to-end-test-suite-builder.js';
import fs from 'node:fs';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {resetForTest} from '../../test-container.js';
import {InitTest} from './tests/init-test.js';
import {ClusterReferenceTest} from './tests/cluster-reference-test.js';
import {DeploymentTest} from './tests/deployment-test.js';
import {NodeTest} from './tests/node-test.js';
import {BlockNodeTest} from './tests/block-node-test.js';
import {NetworkTest} from './tests/network-test.js';
import {AccountTest} from './tests/account-test.js';
import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  HbarUnit,
  Logger,
  LogLevel,
  PrivateKey,
  Status,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  type AccountInfo,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {type BaseTestOptions} from './tests/base-test-options.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {type AccountCommand} from '../../../src/commands/account.js';
import {type K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {type AccountManager} from '../../../src/core/account-manager.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';

type AccountInfoData = {
  accountId: string;
  balance: number;
  publicKey: string;
  privateKey?: string;
  accountAlias?: string;
};
const testName: string = 'account-test';

new EndToEndTestSuiteBuilder()
  .withTestName(testName)
  .withTestSuiteName('Account Command E2E Test Suite')
  .withNamespace(testName)
  .withDeployment(`${testName}-deployment`)
  .withClusterCount(1)
  .withConsensusNodesCount(1)
  .withLoadBalancerEnabled(false)
  .withPinger(false)
  .withRealm(0)
  .withShard(0)
  .withServiceMonitor(true)
  .withPodLog(true)
  .withTestSuiteCallback((options: BaseTestOptions): void => {
    describe('Account E2E Test', (): void => {
      const {testCacheDirectory, testLogger: logger, namespace, contexts} = options;
      let accountCommand: AccountCommand;
      let accountManager: AccountManager;

      // TODO the kube config context causes issues if it isn't one of the selected clusters we are deploying to
      before(async (): Promise<void> => {
        fs.rmSync(testCacheDirectory, {recursive: true, force: true});
        try {
          fs.rmSync(PathEx.joinWithRealPath(testCacheDirectory, '..', DEFAULT_LOCAL_CONFIG_FILE), {
            force: true,
          });
        } catch {
          // allowed to fail if the file doesn't exist
        }
        resetForTest(namespace.name, testCacheDirectory, false);
        for (const item of contexts) {
          await container.resolve<K8ClientFactory>(InjectTokens.K8Factory).getK8(item).namespaces().delete(namespace);
        }
        logger.info(`${testName}: starting ${testName} e2e test`);
      }).timeout(Duration.ofMinutes(5).toMillis());

      beforeEach(async (): Promise<void> => {
        logger.info(`${testName}: resetting containers for each test`);
        resetForTest(namespace.name, testCacheDirectory, false);
        logger.info(`${testName}: finished resetting containers for each test`);
      });

      afterEach(async (): Promise<void> => await sleep(Duration.ofMillis(5)));

      InitTest.init(options);
      ClusterReferenceTest.connect(options);
      DeploymentTest.create(options);
      DeploymentTest.addCluster(options);
      NodeTest.keys(options);
      BlockNodeTest.add(options);

      NetworkTest.deploy(options);
      NodeTest.setup(options);
      NodeTest.start(options);

      AccountTest.init(options);
      AccountTest.specialAccountsShouldHaveNewKeys(options);

      AccountTest.create(options);
      // const accountId1: string = AccountTest.validateAccountInfo();

      AccountTest.create(options, constants.GENESIS_KEY, 777);
      // const accountId2: string = AccountTest.validateAccountInfo(constants.GENESIS_KEY, 777);

      // AccountTest.update(options, accountId1);
      // AccountTest.update(options, accountId2, 333, constants.GENESIS_KEY);
      //
      // AccountTest.info(options, accountId1);
      //
      // it('validate account 1 ', (): void => {
      //   const accountInfo: AccountInfoData = accountCommand.accountInfo;
      //   expect(accountInfo).not.to.be.null;
      //   expect(accountInfo.accountId).to.equal(accountId1);
      //   expect(accountInfo.privateKey).to.be.undefined;
      //   expect(accountInfo.publicKey).to.be.ok;
      // });
      //
      // AccountTest.info(options, accountId2);
      //
      // it('validate account 2 ', (): void => {
      //   const accountInfo: AccountInfoData = accountCommand.accountInfo;
      //   expect(accountInfo).not.to.be.null;
      //   expect(accountInfo.accountId).to.equal(accountId2);
      //   expect(accountInfo.privateKey).to.be.undefined;
      //   expect(accountInfo.publicKey).to.be.ok;
      //   expect(accountInfo.balance).to.equal(1110);
      // });

      const ecdsaPrivateKey: PrivateKey = PrivateKey.generateECDSA();

      AccountTest.create(options, undefined, 0, ecdsaPrivateKey.toString());

      it('should succeed with prerequisites', async (): Promise<void> => {
        await container.resolve<LocalConfigRuntimeState>(InjectTokens.LocalConfigRuntimeState).load();
        accountCommand = container.resolve<AccountCommand>(InjectTokens.AccountCommand);
        accountManager = container.resolve<AccountManager>(InjectTokens.AccountManager);
      });

      it('should validate new account', async (): Promise<void> => {
        // @ts-expect-error - TS2341: to access private property
        const accountInfo: AccountInfoData = accountCommand.accountInfo;
        expect(accountInfo).not.to.be.null;
        expect(accountInfo.accountId).not.to.be.null;
        expect(accountInfo.privateKey.toString()).to.equal(ecdsaPrivateKey.toString());
        expect(accountInfo.publicKey.toString()).to.equal(ecdsaPrivateKey.publicKey.toString());
        expect(accountInfo.balance).to.be.greaterThan(0);

        const accountId: AccountId = AccountId.fromString(accountInfo.accountId);
        expect(accountInfo.accountAlias).to.equal(
          `${accountId.realm}.${accountId.shard}.${ecdsaPrivateKey.publicKey.toEvmAddress()}`,
        );

        await accountManager.loadNodeClient(namespace, options.clusterReferences, options.deployment, true);

        const accountAliasInfo: AccountInfo = await accountManager.accountInfoQuery(accountInfo.accountAlias);
        expect(accountAliasInfo).not.to.be.null;
      });

      let accountInfo: AccountInfoData;

      let MY_ACCOUNT_ID: string;
      let MY_PRIVATE_KEY: string;

      it('Create new account', async (): Promise<void> => {
        await accountManager.loadNodeClient(namespace, options.clusterReferences, options.deployment, true);
        const privateKey: PrivateKey = PrivateKey.generate();
        const amount: number = 100;

        const newAccount: TransactionResponse = await new AccountCreateTransaction()
          .setKey(privateKey)
          .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
          .execute(accountManager._nodeClient);

        // Get the new account ID
        const getReceipt: TransactionReceipt = await newAccount.getReceipt(accountManager._nodeClient);
        accountInfo = {
          accountId: getReceipt.accountId.toString(),
          privateKey: privateKey.toString(),
          publicKey: privateKey.publicKey.toString(),
          balance: amount,
        };

        MY_ACCOUNT_ID = accountInfo.accountId;
        MY_PRIVATE_KEY = accountInfo.privateKey;

        logger.info(`Account created: ${JSON.stringify(accountInfo)}`);
        expect(accountInfo.accountId).not.to.be.null;
        expect(accountInfo.balance).to.equal(amount);
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('Create client from network config and submit topic/message should succeed', async (): Promise<void> => {
        // Setup network configuration
        const networkConfig: Record<string, AccountId> = {
          ['127.0.0.1:30212']: AccountId.fromString('0.0.3'),
          ['127.0.0.1:30213']: AccountId.fromString('0.0.4'),
        };

        // Instantiate SDK client
        const sdkClient: Client = Client.fromConfig({network: networkConfig, scheduleNetworkUpdate: false});
        sdkClient.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);
        sdkClient.setLogger(new Logger(LogLevel.Trace, 'hashgraph-sdk.log'));

        // Create a new public topic and submit a message
        const txResponse: TransactionResponse = await new TopicCreateTransaction().execute(sdkClient);
        const receipt: TransactionReceipt = await txResponse.getReceipt(sdkClient);

        const submitResponse: TransactionResponse = await new TopicMessageSubmitTransaction({
          topicId: receipt.topicId,
          message: 'Hello, Hedera!',
        }).execute(sdkClient);

        const submitReceipt: TransactionReceipt = await submitResponse.getReceipt(sdkClient);

        expect(submitReceipt.status).to.deep.equal(Status.Success);
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('Enable Envoy proxy port forwarding and create client from network config should succeed', async (): Promise<void> => {
        // using label `app=envoy-proxy-node1` to find Envoy proxy pod
        const envoyProxyPod: Pod[] = await container
          .resolve<K8ClientFactory>(InjectTokens.K8Factory)
          .default()
          .pods()
          .list(namespace, ['app=envoy-proxy-node1']);
        // enable port-forward of Envoy proxy pod
        const portNumber: number = await container
          .resolve<K8ClientFactory>(InjectTokens.K8Factory)
          .default()
          .pods()
          .readByReference(envoyProxyPod[0].podReference)
          .portForward(10_500, 8080);

        // Setup network configuration
        const networkConfig: Record<string, AccountId> = {['127.0.0.1:10500']: AccountId.fromString('0.0.3')};

        // Instantiate SDK client
        const sdkClient: Client = Client.fromConfig({network: networkConfig, scheduleNetworkUpdate: false});
        sdkClient.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

        // Create a new public topic and submit a message
        const txResponse: TransactionResponse = await new TopicCreateTransaction().execute(sdkClient);
        const receipt: TransactionReceipt = await txResponse.getReceipt(sdkClient);

        const submitResponse: TransactionResponse = await new TopicMessageSubmitTransaction({
          topicId: receipt.topicId,
          message: 'Hello, Hedera!',
        }).execute(sdkClient);

        const submitReceipt: TransactionReceipt = await submitResponse.getReceipt(sdkClient);

        expect(submitReceipt.status).to.deep.equal(Status.Success);

        // stop port forwarding
        await container
          .resolve<K8ClientFactory>(InjectTokens.K8Factory)
          .default()
          .pods()
          .readByReference(envoyProxyPod[0].podReference)
          .stopPortForward(portNumber);
      }).timeout(Duration.ofMinutes(2).toMillis());

      // hitchhiker account test to test node freeze and restart
      NetworkTest.freeze(options);
      NetworkTest.restart(options);
    }).timeout(Duration.ofMinutes(30).toMillis());
  })
  .build()
  .runTestSuite();
