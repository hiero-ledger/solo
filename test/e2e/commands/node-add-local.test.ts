// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';

import {testNodeAdd} from '../../test-add.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type BootstrapResponse} from '../../test-utility.js';
import {Flags as flags} from '../../../src/commands/flags.js';
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
import {type DeploymentName} from '../../../src/types/index.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type Argv} from '../../helpers/argv-wrapper.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SOLO_LOGS_DIR} from '../../../src/core/constants.js';
import {LedgerCommandDefinition} from '../../../src/commands/command-definitions/ledger-command-definition.js';
import {sleep} from '../../../src/core/helpers.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';

function additionalTests(bootstrapResp: BootstrapResponse, argv: Argv): void {
  const {
    opts: {commandInvoker, remoteConfig},
    cmd: {nodeCmd, accountCmd},
    manager: {accountManager},
  } = bootstrapResp;

  const namespace: NamespaceName = NamespaceName.of(argv.getArg(flags.namespace));

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
    await commandInvoker.invoke({
      argv: argv,
      command: LedgerCommandDefinition.COMMAND_NAME,
      subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
      action: LedgerCommandDefinition.ACCOUNT_CREATE,
      callback: async (argv): Promise<boolean> => accountCmd.create(argv),
    });

    await sleep(Duration.ofSeconds(1));

    await commandInvoker.invoke({
      argv: argv,
      command: LedgerCommandDefinition.COMMAND_NAME,
      subcommand: LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
      action: LedgerCommandDefinition.ACCOUNT_CREATE,
      callback: async (argv): Promise<boolean> => accountCmd.create(argv),
    });

    await commandInvoker.invoke({
      argv: argv,
      command: ConsensusCommandDefinition.COMMAND_NAME,
      subcommand: ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      action: ConsensusCommandDefinition.NETWORK_FREEZE,
      callback: async (argv): Promise<boolean> => nodeCmd.handlers.freeze(argv),
    });

    await commandInvoker.invoke({
      argv,
      command: ConsensusCommandDefinition.COMMAND_NAME,
      subcommand: ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
      action: ConsensusCommandDefinition.STATE_DOWNLOAD,
      callback: async (argv): Promise<boolean> => nodeCmd.handlers.states(argv),
    });

    await commandInvoker.invoke({
      argv: argv,
      command: ConsensusCommandDefinition.COMMAND_NAME,
      subcommand: ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      action: ConsensusCommandDefinition.NODE_RESTART,
      callback: async (argv): Promise<boolean> => nodeCmd.handlers.restart(argv),
    });

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

  it('get the logs', async (): Promise<void> => {
    await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
  }).timeout(Duration.ofMinutes(10).toMillis());
}

describe('Node add with hedera local build', (): void => {
  const localBuildPath: string =
    'node1=../hiero-consensus-node/hedera-node/data/,../hiero-consensus-node/hedera-node/data,node3=../hiero-consensus-node/hedera-node/data';
  testNodeAdd(localBuildPath, undefined, undefined, additionalTests);
}).timeout(Duration.ofMinutes(3).toMillis());
