// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';

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
} from '@hiero-ledger/sdk';
import * as constants from '../../../src/core/constants.js';
import * as version from '../../../version.js';
import {endToEndTestSuite, getTestCluster, getTestLogger, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import {AccountCommand} from '../../../src/commands/account.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import * as helpers from '../../../src/core/helpers.js';
import {entityId} from '../../../src/core/helpers.js';
import {Templates} from '../../../src/core/templates.js';
import * as Base64 from 'js-base64';
import {Argv} from '../../helpers/argv-wrapper.js';
import {type DeploymentName, type Realm, type Shard} from '../../../src/types/index.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {main} from '../../../src/index.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {type InstanceOverrides} from '../../../src/core/dependency-injection/container-init.js';
import {ValueContainer} from '../../../src/core/dependency-injection/value-container.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {LedgerCommandDefinition} from '../../../src/commands/command-definitions/ledger-command-definition.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';

const defaultTimeout = Duration.ofSeconds(20).toMillis();

const testName = 'account-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const testSystemAccounts = [[3, 5]];
const argv = Argv.getDefaultArgv(namespace);
argv.setArg(flags.forcePortForward, true);
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.realm, 0);
argv.setArg(flags.shard, 0);

// enable load balancer for e2e tests
// argv.setArg(flags.loadBalancerEnabled, true);

const overrides: InstanceOverrides = new Map<symbol, ValueContainer>([
  [InjectTokens.SystemAccounts, new ValueContainer(InjectTokens.SystemAccounts, testSystemAccounts)],
]);

endToEndTestSuite(testName, argv, {containerOverrides: overrides}, bootstrapResp => {
  describe('AccountCommand', () => {
    let accountCmd: AccountCommand;
    let testLogger: SoloLogger;

    const {
      opts: {k8Factory, accountManager, configManager, remoteConfig},
      cmd: {nodeCmd},
    } = bootstrapResp;

    before(async () => {
      accountCmd = container.resolve(AccountCommand) as AccountCommand;
      bootstrapResp.cmd.accountCmd = accountCmd;
      const localConfig = container.resolve<LocalConfigRuntimeState>(InjectTokens.LocalConfigRuntimeState);
      await localConfig.load();
      testLogger = getTestLogger();
    });

    after(async function () {
      this.timeout(Duration.ofMinutes(3).toMillis());

      await k8Factory.default().namespaces().delete(namespace);
      await accountManager.close();
      await nodeCmd.close();
    });

    describe('node proxies should be UP', () => {
      for (const nodeAlias of argv.getArg<string>(flags.nodeAliasesUnparsed).split(',')) {
        it(`proxy should be UP: ${nodeAlias} `, async () => {
          await k8Factory
            .default()
            .pods()
            .waitForReadyStatus(
              namespace,
              [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'],
              300,
              Duration.ofSeconds(2).toMillis(),
            );
        }).timeout(Duration.ofSeconds(30).toMillis());
      }
    });

    describe('ledger system init command', () => {
      it('should succeed with init command', async () => {
        const {newArgv} = BaseCommandTest;
        const initArguments: string[] = newArgv();
        initArguments.push(
          LedgerCommandDefinition.COMMAND_NAME,
          LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
          LedgerCommandDefinition.SYSTEM_INIT,
          '--deployment',
          `${namespace.name}-deployment`,
          '--node-aliases',
          argv.getArg<string>(flags.nodeAliasesUnparsed),
          '--cluster-ref',
          argv.getArg<string>(flags.clusterRef),
        );
        await main(initArguments);
      }).timeout(Duration.ofMinutes(8).toMillis());

      describe('special accounts should have new keys', () => {
        const genesisKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
        const realm: Realm = argv.getArg(flags.realm);
        const shard: Shard = argv.getArg(flags.shard);

        before(async function () {
          this.timeout(Duration.ofSeconds(20).toMillis());

          await accountManager.loadNodeClient(
            namespace,
            remoteConfig.getClusterRefs(),
            argv.getArg<DeploymentName>(flags.deployment),
            argv.getArg<boolean>(flags.forcePortForward),
          );
        });

        after(async function () {
          this.timeout(Duration.ofSeconds(20).toMillis());
          await accountManager.close();
        });

        it('Node admin key should have been updated, not equal to genesis key', async () => {
          const nodeAliases = helpers.parseNodeAliases(
            argv.getArg<string>(flags.nodeAliasesUnparsed),
            bootstrapResp.opts.remoteConfig.getConsensusNodes(),
            bootstrapResp.opts.configManager,
          );
          for (const nodeAlias of nodeAliases) {
            const keyFromK8 = await k8Factory
              .default()
              .secrets()
              .read(namespace, Templates.renderNodeAdminKeyName(nodeAlias));
            const privateKey = Base64.decode(keyFromK8.data.privateKey);

            expect(privateKey.toString()).not.to.equal(genesisKey.toString());
          }
        });

        for (const [start, end] of testSystemAccounts) {
          for (let index = start; index <= end; index++) {
            it(`account ${index} should not have genesis key`, async () => {
              expect(accountManager._nodeClient).not.to.be.null;

              const accountId = entityId(shard, realm, index);
              testLogger.info(`Fetching account keys: accountId ${accountId}`);
              const keys = await accountManager.getAccountKeys(accountId);
              testLogger.info(`Fetched account keys: accountId ${accountId}`);

              expect(keys.length).not.to.equal(0);
              expect(keys[0].toString()).not.to.equal(genesisKey.toString());
            }).timeout(Duration.ofSeconds(20).toMillis());
          }
        }
      });
    });

    describe('ledger account create/update command', () => {
      let accountId1: string, accountId2: string;

      it('should create account with no options', async () => {
        try {
          argv.setArg(flags.amount, 200);

          const {newArgv} = BaseCommandTest;
          const createArguments: string[] = newArgv();
          createArguments.push(
            LedgerCommandDefinition.COMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_CREATE,
            '--deployment',
            `${namespace.name}-deployment`,
            '--hbar-amount',
            String(argv.getArg<number>(flags.amount)),
          );
          await main(createArguments);

          // @ts-expect-error - TS2341: to access private property
          const accountInfo = accountCmd.accountInfo;

          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).not.to.be.null;

          accountId1 = accountInfo.accountId;

          expect(accountInfo.privateKey).not.to.be.null;
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(configManager.getFlag(flags.amount));
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(Duration.ofSeconds(40).toMillis());

      it('should create account with private key and hbar amount options', async () => {
        try {
          argv.setArg(flags.ed25519PrivateKey, constants.GENESIS_KEY);
          argv.setArg(flags.amount, 777);

          const {newArgv} = BaseCommandTest;
          const createArguments2: string[] = newArgv();
          createArguments2.push(
            LedgerCommandDefinition.COMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_CREATE,
            '--deployment',
            `${namespace.name}-deployment`,
            '--ed25519-private-key',
            String(argv.getArg<string>(flags.ed25519PrivateKey)),
            '--hbar-amount',
            String(argv.getArg<number>(flags.amount)),
          );
          await main(createArguments2);

          // @ts-expect-error - TS2341: to access private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).not.to.be.null;
          accountId2 = accountInfo.accountId;
          expect(accountInfo.privateKey.toString()).to.equal(constants.GENESIS_KEY);
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(configManager.getFlag(flags.amount));
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should update account-1', async () => {
        try {
          argv.setArg(flags.amount, 0);
          argv.setArg(flags.accountId, accountId1);

          const {newArgv} = BaseCommandTest;
          const updateArguments: string[] = newArgv();
          updateArguments.push(
            LedgerCommandDefinition.COMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_UPDATE,
            '--deployment',
            `${namespace.name}-deployment`,
            '--account-id',
            String(argv.getArg<string>(flags.accountId)),
            '--hbar-amount',
            String(argv.getArg<number>(flags.amount)),
          );
          await main(updateArguments);

          // @ts-expect-error - TS2341: to access private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv.getArg<string>(flags.accountId));
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(200);
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should update account-2 with accountId, amount, new private key, and standard out options', async () => {
        try {
          argv.setArg(flags.accountId, accountId2);
          argv.setArg(flags.ed25519PrivateKey, constants.GENESIS_KEY);
          argv.setArg(flags.amount, 333);

          const {newArgv} = BaseCommandTest;
          const updateArguments2: string[] = newArgv();
          updateArguments2.push(
            LedgerCommandDefinition.COMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_UPDATE,
            '--deployment',
            `${namespace.name}-deployment`,
            '--account-id',
            String(argv.getArg<string>(flags.accountId)),
            '--ed25519-private-key',
            String(argv.getArg<string>(flags.ed25519PrivateKey)),
            '--hbar-amount',
            String(argv.getArg<number>(flags.amount)),
          );
          await main(updateArguments2);

          // @ts-expect-error - TS2341: to access private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv.getArg<string>(flags.accountId));
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).not.to.be.null;
          expect(accountInfo.balance).to.equal(1110);
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should be able to get account-1', async () => {
        try {
          argv.setArg(flags.accountId, accountId1);

          const {newArgv} = BaseCommandTest;
          const infoArguments: string[] = newArgv();
          infoArguments.push(
            LedgerCommandDefinition.COMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_INFO,
            '--deployment',
            `${namespace.name}-deployment`,
            '--account-id',
            String(argv.getArg<string>(flags.accountId)),
          );
          await main(infoArguments);

          // @ts-expect-error - TS2341: to access private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv.getArg<string>(flags.accountId));
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).to.be.ok;
          expect(accountInfo.balance).to.equal(200);
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should be able to get account-2', async () => {
        try {
          argv.setArg(flags.accountId, accountId2);

          const {newArgv} = BaseCommandTest;
          const infoArguments2: string[] = newArgv();
          infoArguments2.push(
            LedgerCommandDefinition.COMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_INFO,
            '--deployment',
            `${namespace.name}-deployment`,
            '--account-id',
            String(argv.getArg<string>(flags.accountId)),
          );
          await main(infoArguments2);

          // @ts-expect-error - TS2341: to access private property
          const accountInfo = accountCmd.accountInfo;
          expect(accountInfo).not.to.be.null;
          expect(accountInfo.accountId).to.equal(argv.getArg<string>(flags.accountId));
          expect(accountInfo.privateKey).to.be.undefined;
          expect(accountInfo.publicKey).to.be.ok;
          expect(accountInfo.balance).to.equal(1110);
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);

      it('should create account with ecdsa private key and set alias', async () => {
        const ecdsaPrivateKey = PrivateKey.generateECDSA();

        try {
          argv.setArg(flags.ecdsaPrivateKey, ecdsaPrivateKey.toString());
          argv.setArg(flags.setAlias, true);

          const {newArgv} = BaseCommandTest;
          const createEcdsaArguments: string[] = newArgv();
          createEcdsaArguments.push(
            LedgerCommandDefinition.COMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
            LedgerCommandDefinition.ACCOUNT_CREATE,
            '--deployment',
            `${namespace.name}-deployment`,
            '--ecdsa-private-key',
            String(argv.getArg<string>(flags.ecdsaPrivateKey)),
            '--set-alias',
          );
          await main(createEcdsaArguments);

          // @ts-expect-error - TS2341: to access private property
          const newAccountInfo = accountCmd.accountInfo;
          expect(newAccountInfo).not.to.be.null;
          expect(newAccountInfo.accountId).not.to.be.null;
          expect(newAccountInfo.privateKey.toString()).to.equal(ecdsaPrivateKey.toString());
          expect(newAccountInfo.publicKey.toString()).to.equal(ecdsaPrivateKey.publicKey.toString());
          expect(newAccountInfo.balance).to.be.greaterThan(0);

          const accountId = AccountId.fromString(newAccountInfo.accountId);
          expect(newAccountInfo.accountAlias).to.equal(
            `${accountId.realm}.${accountId.shard}.${ecdsaPrivateKey.publicKey.toEvmAddress()}`,
          );

          await accountManager.loadNodeClient(
            namespace,
            remoteConfig.getClusterRefs(),
            argv.getArg<DeploymentName>(flags.deployment),
            argv.getArg<boolean>(flags.forcePortForward),
          );
          const accountAliasInfo = await accountManager.accountInfoQuery(newAccountInfo.accountAlias);
          expect(accountAliasInfo).not.to.be.null;
        } catch (error) {
          testLogger.showUserError(error);
          expect.fail();
        }
      }).timeout(defaultTimeout);
    });

    describe('Test SDK create account and submit transaction', () => {
      let accountInfo: {
        accountId: string;
        privateKey: string;
        publicKey: string;
        balance: number;
      };

      let MY_ACCOUNT_ID: string;
      let MY_PRIVATE_KEY: string;

      it('Create new account', async () => {
        try {
          await accountManager.loadNodeClient(
            namespace,
            remoteConfig.getClusterRefs(),
            argv.getArg<DeploymentName>(flags.deployment),
            argv.getArg<boolean>(flags.forcePortForward),
          );
          const privateKey = PrivateKey.generate();
          const amount = 100;

          const newAccount = await new AccountCreateTransaction()
            .setKey(privateKey)
            .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
            .execute(accountManager._nodeClient);

          // Get the new account ID
          const getReceipt = await newAccount.getReceipt(accountManager._nodeClient);
          accountInfo = {
            accountId: getReceipt.accountId.toString(),
            privateKey: privateKey.toString(),
            publicKey: privateKey.publicKey.toString(),
            balance: amount,
          };

          MY_ACCOUNT_ID = accountInfo.accountId;
          MY_PRIVATE_KEY = accountInfo.privateKey;

          testLogger.info(`Account created: ${JSON.stringify(accountInfo)}`);
          expect(accountInfo.accountId).not.to.be.null;
          expect(accountInfo.balance).to.equal(amount);
        } catch (error) {
          testLogger.showUserError(error);
        }
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('Create client from network config and submit topic/message should succeed', async () => {
        try {
          // Setup network configuration
          const networkConfig = {
            ['127.0.0.1:30212']: AccountId.fromString('0.0.3'),
            ['127.0.0.1:30213']: AccountId.fromString('0.0.4'),
          };

          // Instantiate SDK client
          const sdkClient = Client.fromConfig({network: networkConfig, scheduleNetworkUpdate: false});
          sdkClient.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);
          sdkClient.setLogger(new Logger(LogLevel.Trace, 'hashgraph-sdk.log'));

          // Create a new public topic and submit a message
          const txResponse = await new TopicCreateTransaction().execute(sdkClient);
          const receipt = await txResponse.getReceipt(sdkClient);

          const submitResponse = await new TopicMessageSubmitTransaction({
            topicId: receipt.topicId,
            message: 'Hello, Hedera!',
          }).execute(sdkClient);

          const submitReceipt = await submitResponse.getReceipt(sdkClient);

          expect(submitReceipt.status).to.deep.equal(Status.Success);
        } catch (error) {
          testLogger.showUserError(error);
        }
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('Enable Envoy proxy port forwarding and create client from network config should succeed', async () => {
        try {
          // using label `app=envoy-proxy-node1` to find Envoy proxy pod
          const envoyProxyPod = await k8Factory.default().pods().list(namespace, ['app=envoy-proxy-node1']);
          // enable portfroward of Envoy proxy pod
          const portNumber = await k8Factory
            .default()
            .pods()
            .readByReference(envoyProxyPod[0].podReference)
            .portForward(10_500, 8080);

          // Setup network configuration
          const networkConfig = {['127.0.0.1:10500']: AccountId.fromString('0.0.3')};

          // Instantiate SDK client
          const sdkClient = Client.fromConfig({network: networkConfig, scheduleNetworkUpdate: false});
          sdkClient.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

          // Create a new public topic and submit a message
          const txResponse = await new TopicCreateTransaction().execute(sdkClient);
          const receipt = await txResponse.getReceipt(sdkClient);

          const submitResponse = await new TopicMessageSubmitTransaction({
            topicId: receipt.topicId,
            message: 'Hello, Hedera!',
          }).execute(sdkClient);

          const submitReceipt = await submitResponse.getReceipt(sdkClient);

          expect(submitReceipt.status).to.deep.equal(Status.Success);

          // stop port forwarding
          await k8Factory.default().pods().readByReference(envoyProxyPod[0].podReference).stopPortForward(portNumber);
        } catch (error) {
          testLogger.showUserError(error);
        }
      }).timeout(Duration.ofMinutes(2).toMillis());

      // hitchhiker account test to test node freeze and restart
      it('Freeze and restart all nodes should succeed', async () => {
        try {
          const {newArgv, argvPushGlobalFlags} = BaseCommandTest;

          const freezeArguments: string[] = newArgv();
          argvPushGlobalFlags(freezeArguments, testName, true);
          freezeArguments.push(
            ConsensusCommandDefinition.COMMAND_NAME,
            ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.NETWORK_FREEZE,
            '--deployment',
            `${namespace.name}-deployment`,
          );
          await main(freezeArguments);

          const restartArguments: string[] = newArgv();
          argvPushGlobalFlags(restartArguments, testName, true);
          restartArguments.push(
            ConsensusCommandDefinition.COMMAND_NAME,
            ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
            ConsensusCommandDefinition.NODE_RESTART,
            '--deployment',
            `${namespace.name}-deployment`,
          );
          await main(restartArguments);
        } catch (error) {
          testLogger.showUserError(error);
        }
      }).timeout(Duration.ofMinutes(10).toMillis());
    });
  });
});
