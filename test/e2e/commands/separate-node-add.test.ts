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
import {main} from '../../../src/index.js';
import {BaseCommandTest} from './tests/base-command-test.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';

export function testSeparateNodeAdd(
  argv: Argv,
  bootstrapResp: BootstrapResponse,
  namespace: NamespaceName,
  timeout: number,
): void {
  const temporaryDirectory: string = 'contextDir';

  const {
    opts: {k8Factory, accountManager, remoteConfig, logger},
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
      await main(
        buildMainArgv(
          namespace.toString(),
          LedgerCommandDefinition.COMMAND_NAME,
          LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
          LedgerCommandDefinition.SYSTEM_INIT,
        ),
      );
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should add a new node to the network successfully', async (): Promise<void> => {
      const argvPrepare: Argv = argv.clone();
      argvPrepare.setArg(flags.outputDir, temporaryDirectory);

      argvPrepare.setCommand(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.DEV_NODE_PREPARE,
      );

      await main(
        buildMainArgv(
          namespace.toString(),
          ConsensusCommandDefinition.COMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_PREPARE,
          new Map<CommandFlag, string>([
            [flags.outputDir, temporaryDirectory],
            [flags.deployment, argv.getArg<DeploymentName>(flags.deployment)],
          ]),
        ),
      );

      await main(
        buildMainArgv(
          namespace.toString(),
          ConsensusCommandDefinition.COMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
          new Map<CommandFlag, string>([
            [flags.inputDir, temporaryDirectory],
            [flags.deployment, argv.getArg<DeploymentName>(flags.deployment)],
          ]),
        ),
      );

      await main(
        buildMainArgv(
          namespace.toString(),
          ConsensusCommandDefinition.COMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_EXECUTE,
          new Map<CommandFlag, string>([
            [flags.inputDir, temporaryDirectory],
            [flags.deployment, argv.getArg<DeploymentName>(flags.deployment)],
          ]),
        ),
      );

      await accountManager.close();
      argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
    }).timeout(Duration.ofMinutes(12).toMillis());

    it('should be able to create account after a separated consensus node add commands', async (): Promise<void> => {
      await main(
        buildMainArgv(
          namespace.toString(),
          LedgerCommandDefinition.COMMAND_NAME,
          LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
          LedgerCommandDefinition.ACCOUNT_CREATE,
          new Map<CommandFlag, string>([[flags.deployment, argv.getArg<DeploymentName>(flags.deployment)]]),
        ),
      );
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
      const argvAccountCreate: Argv = argv.clone();
      argvAccountCreate.setCommand(
        LedgerCommandDefinition.COMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_CREATE,
      );

      const accountCreateArgv: string[] = buildMainArgv(
        namespace.toString(),
        LedgerCommandDefinition.COMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
        LedgerCommandDefinition.ACCOUNT_CREATE,
        new Map<CommandFlag, string>([[flags.deployment, argv.getArg<DeploymentName>(flags.deployment)]]),
      );
      await main(accountCreateArgv);

      await sleep(Duration.ofSeconds(1));

      await main(accountCreateArgv);

      await main(
        buildMainArgv(
          namespace.toString(),
          ConsensusCommandDefinition.COMMAND_NAME,
          ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.NETWORK_FREEZE,
          new Map<CommandFlag, string>([[flags.deployment, argv.getArg<DeploymentName>(flags.deployment)]]),
        ),
      );

      await main(
        buildMainArgv(
          namespace.toString(),
          ConsensusCommandDefinition.COMMAND_NAME,
          ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.STATE_DOWNLOAD,
          new Map<CommandFlag, string>([[flags.deployment, argv.getArg<DeploymentName>(flags.deployment)]]),
        ),
      );

      await main(
        buildMainArgv(
          namespace.toString(),
          ConsensusCommandDefinition.COMMAND_NAME,
          ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.NODE_RESTART,
          new Map<CommandFlag, string>([[flags.deployment, argv.getArg<DeploymentName>(flags.deployment)]]),
        ),
      );

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

export function buildMainArgv(
  testName: string,
  command: string,
  subCommand: string,
  action: string,
  flagsAndValues: Map<CommandFlag, string> = new Map<CommandFlag, string>(),
): string[] {
  const {newArgv, argvPushGlobalFlags, optionFromFlag} = BaseCommandTest;
  const argv: string[] = newArgv();
  argv.push(command, subCommand, action);
  for (const [flag, value] of flagsAndValues.entries()) {
    argv.push(optionFromFlag(flag), value);
  }
  argvPushGlobalFlags(argv, testName);
  return argv;
}
