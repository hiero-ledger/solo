// SPDX-License-Identifier: Apache-2.0

import {it, describe} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  type BootstrapResponse,
  getNodeAliasesPrivateKeysHash,
  getTemporaryDirectory,
} from '../../test-utility.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type Argv} from '../../helpers/argv-wrapper.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {type DeploymentName} from '../../../src/types/index.js';
import {type NodeServiceMapping} from '../../../src/types/mappings/node-service-mapping.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
import {LedgerCommandDefinition} from '../../../src/commands/command-definitions/ledger-command-definition.js';
import {
  type AccountBalance,
  AccountBalanceQuery,
  AccountCreateTransaction,
  Hbar,
  HbarUnit,
  PrivateKey,
  type TransactionReceipt,
  type TransactionResponse,
} from '@hiero-ledger/sdk';
import {sleep} from '../../../src/core/helpers.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SOLO_LOGS_DIR} from '../../../src/core/constants.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {main} from '../../../src/index.js';

export function testSeparateNodeAdd(
  argv: Argv,
  bootstrapResp: BootstrapResponse,
  namespace: NamespaceName,
  timeout: number,
): void {
  const temporaryDirectory: string = 'contextDir';

  const argvPrepare: Argv = argv.clone();
  argvPrepare.setArg(flags.outputDir, temporaryDirectory);

  const argvExecute: Argv = argv.clone();
  argvExecute.setArg(flags.inputDir, temporaryDirectory);

  const {
    opts: {k8Factory, accountManager, remoteConfig, logger},
    cmd: {nodeCmd, accountCmd},
  } = bootstrapResp;

  describe('Node add via separated commands should success', async (): Promise<void> => {
    let existingServiceMap: NodeServiceMapping;
    let existingNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>>;

    it('cache current version of private keys', async (): Promise<void> => {
      existingServiceMap = await accountManager.getNodeServiceMap(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
      );
      existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );
    }).timeout(timeout);

    it('should succeed with init command', async (): Promise<void> => {
      const {newArgv, argvPushGlobalFlags} = BaseCommandTest;
      const initArguments: string[] = newArgv();
      argvPushGlobalFlags(initArguments, namespace.name, true);
      initArguments.push(
        LedgerCommandDefinition.COMMAND_NAME,
        LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
        LedgerCommandDefinition.SYSTEM_INIT,
        '--namespace',
        namespace.name,
        '--release-tag',
        argv.getArg<string>(flags.releaseTag),
        '--node-aliases-unparsed',
        argv.getArg<string>(flags.nodeAliasesUnparsed),
        '--generate-gossip-keys',
        '--generate-tls-keys',
        '--cluster-ref',
        argv.getArg<string>(flags.clusterRef),
        '--realm',
        String(argv.getArg<number>(flags.realm)),
        '--shard',
        String(argv.getArg<number>(flags.shard)),
        '--force-port-forward',
      );
      await main(initArguments);
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should add a new node to the network successfully', async (): Promise<void> => {
      const {newArgv, argvPushGlobalFlags} = BaseCommandTest;

      const prepareArguments = newArgv();
      argvPushGlobalFlags(prepareArguments, namespace.name, true);
      prepareArguments.push(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_PREPARE,
        '--output-dir',
        temporaryDirectory,
      );
      await main(prepareArguments);

      const submitArguments = newArgv();
      argvPushGlobalFlags(submitArguments, namespace.name, true);
      submitArguments.push(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
        '--input-dir',
        temporaryDirectory,
      );
      await main(submitArguments);

      const executeArguments = newArgv();
      argvPushGlobalFlags(executeArguments, namespace.name, true);
      executeArguments.push(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_EXECUTE,
        '--input-dir',
        temporaryDirectory,
      );
      await main(executeArguments);

      await accountManager.close();
      argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
    }).timeout(Duration.ofMinutes(12).toMillis());

    it('should be able to create account after a separated consensus node add commands', async (): Promise<void> => {
      const {newArgv, argvPushGlobalFlags} = BaseCommandTest;
      const createArguments = newArgv();
      argvPushGlobalFlags(createArguments, namespace.name, true);
      createArguments.push(
        LedgerCommandDefinition.COMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_CREATE,
      );
      await main(createArguments);
    });

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger);

    it('existing nodes private keys should not have changed', async (): Promise<void> => {
      const currentNodeIdsPrivateKeysHash: Map<NodeAlias, Map<string, string>> = await getNodeAliasesPrivateKeysHash(
        existingServiceMap,
        k8Factory,
        getTemporaryDirectory(),
      );

      for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
        const currentNodeKeyHashMap: Map<string, string> = currentNodeIdsPrivateKeysHash.get(nodeAlias);

        for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
          expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.equal(
            `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
          );
        }
      }
    }).timeout(timeout);

    it('should save the state, restart node, and preserve account balances', async (): Promise<void> => {
      // create account before stopping
      await accountManager.loadNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );

      const privateKey: PrivateKey = PrivateKey.generate();
      // get random integer between 100 and 1000
      const amount: number = Math.floor(Math.random() * (1000 - 100) + 100);

      const newAccount: TransactionResponse = await new AccountCreateTransaction()
        .setKeyWithoutAlias(privateKey.publicKey)
        .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
        .execute(accountManager._nodeClient);

      // Get the new account ID
      const getReceipt: TransactionReceipt = await newAccount.getReceipt(accountManager._nodeClient);
      const accountInfo: {accountId: string; balance: number} = {
        accountId: getReceipt.accountId.toString(),
        balance: amount,
      };

      // create more transactions to save more round of states
      const {newArgv, argvPushGlobalFlags} = BaseCommandTest;

      const createArguments1 = newArgv();
      argvPushGlobalFlags(createArguments1, namespace.name, true);
      createArguments1.push(
        LedgerCommandDefinition.COMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_CREATE,
      );
      await main(createArguments1);

      await sleep(Duration.ofSeconds(1));

      const createArguments2 = newArgv();
      argvPushGlobalFlags(createArguments2, namespace.name, true);
      createArguments2.push(
        LedgerCommandDefinition.COMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_CREATE,
      );
      await main(createArguments2);

      const freezeArguments = newArgv();
      argvPushGlobalFlags(freezeArguments, namespace.name, true);
      freezeArguments.push(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.NETWORK_FREEZE,
      );
      await main(freezeArguments);

      const statesArguments = newArgv();
      argvPushGlobalFlags(statesArguments, namespace.name, true);
      statesArguments.push(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.STATE_DOWNLOAD,
      );
      await main(statesArguments);

      const restartArguments = newArgv();
      argvPushGlobalFlags(restartArguments, namespace.name, true);
      restartArguments.push(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.NODE_RESTART,
      );
      await main(restartArguments);

      argv.setArg(flags.stateFile, PathEx.joinWithRealPath(SOLO_LOGS_DIR, namespace.name, 'network-node1-0-state.zip'));

      // check balance of accountInfo.accountId
      await accountManager.loadNodeClient(
        namespace,
        remoteConfig.getClusterRefs(),
        argv.getArg<DeploymentName>(flags.deployment),
        argv.getArg<boolean>(flags.forcePortForward),
      );

      const balance: AccountBalance = await new AccountBalanceQuery()
        .setAccountId(accountInfo.accountId)
        .execute(accountManager._nodeClient);

      expect(balance.hbars).to.be.eql(Hbar.from(accountInfo.balance, HbarUnit.Hbar));
    }).timeout(Duration.ofMinutes(10).toMillis());
  }).timeout(Duration.ofMinutes(3).toMillis());
}
