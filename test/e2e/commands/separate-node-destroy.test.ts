// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {accountCreationShouldSucceed, balanceQueryShouldSucceed, type BootstrapResponse} from '../../test-utility.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {Duration} from '../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type Argv} from '../../helpers/argv-wrapper.js';
import {type Pod} from '../../../src/integration/kube/resources/pod/pod.js';
import {LedgerCommandDefinition} from '../../../src/commands/command-definitions/ledger-command-definition.js';
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';

export function testSeparateNodeDelete(argv: Argv, bootstrapResp: BootstrapResponse, namespace: NamespaceName): void {
  const nodeAlias: NodeAlias = 'node1';

  argv.setArg(flags.nodeAliasesUnparsed, 'node1,node2,node3');
  argv.setArg(flags.nodeAlias, nodeAlias);

  const temporaryDirectory: string = 'contextDir';
  const argvPrepare: Argv = argv.clone();
  argvPrepare.setArg(flags.outputDir, temporaryDirectory);

  const argvExecute: Argv = argv.clone();
  argvExecute.setArg(flags.inputDir, temporaryDirectory);

  const {
    opts: {k8Factory, accountManager, remoteConfig, logger, commandInvoker},
    cmd: {nodeCmd, accountCmd},
  } = bootstrapResp;

  describe('Node delete via separated commands', async (): Promise<void> => {
    it('should succeed with init command', async (): Promise<void> => {
      await commandInvoker.invoke({
        argv: argv,
        command: LedgerCommandDefinition.COMMAND_NAME,
        subcommand: LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
        action: LedgerCommandDefinition.SYSTEM_INIT,
        callback: async (argv): Promise<boolean> => accountCmd.init(argv),
      });
    }).timeout(Duration.ofMinutes(8).toMillis());

    it('should delete a node from the network successfully', async (): Promise<void> => {
      await commandInvoker.invoke({
        argv: argvPrepare,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.DEV_NODE_PREPARE,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.destroyPrepare(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.destroySubmitTransactions(argv),
      });

      await commandInvoker.invoke({
        argv: argvExecute,
        command: ConsensusCommandDefinition.COMMAND_NAME,
        subcommand: ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
        action: ConsensusCommandDefinition.DEV_NODE_EXECUTE,
        callback: async (argv): Promise<boolean> => nodeCmd.handlers.destroyExecute(argv),
      });

      await accountManager.close();
    }).timeout(Duration.ofMinutes(10).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger, nodeAlias);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger, nodeAlias);

    it('deleted consensus node should not be running', async (): Promise<void> => {
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      expect(pods.length).to.equal(1);
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
}
