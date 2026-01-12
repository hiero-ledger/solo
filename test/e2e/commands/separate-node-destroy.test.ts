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
import {ConsensusCommandDefinition} from '../../../src/commands/command-definitions/consensus-command-definition.js';
import {main} from '../../../src/index.js';
import {buildMainArgv} from '../../test-utility.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';

export function testSeparateNodeDelete(argv: Argv, bootstrapResp: BootstrapResponse, namespace: NamespaceName): void {
  const nodeAlias: NodeAlias = 'node1';
  const temporaryDirectory: string = 'contextDir';

  const {
    opts: {k8Factory, accountManager, remoteConfig, logger},
  } = bootstrapResp;

  const flagsMap: Map<CommandFlag, string> = new Map<CommandFlag, string>([
    [flags.nodeAliasesUnparsed, 'node1,node2,node3'],
    [flags.nodeAlias, nodeAlias],
    [flags.devMode, argv.getArg(flags.devMode) ? 'true' : 'false'],
    [flags.quiet, argv.getArg(flags.quiet) ? 'true' : 'false'],
  ]);

  describe('Node delete via separated commands', async (): Promise<void> => {
    it('should delete a node from the network successfully', async (): Promise<void> => {
      await main(
        buildMainArgv(
          namespace.toString(),
          ConsensusCommandDefinition.COMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_PREPARE,
          new Map<CommandFlag, string>([[flags.outputDir, temporaryDirectory], ...flagsMap.entries()]),
        ),
      );

      await main(
        buildMainArgv(
          namespace.toString(),
          ConsensusCommandDefinition.COMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
          new Map<CommandFlag, string>([[flags.inputDir, temporaryDirectory], ...flagsMap.entries()]),
        ),
      );

      await main(
        buildMainArgv(
          namespace.toString(),
          ConsensusCommandDefinition.COMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
          ConsensusCommandDefinition.DEV_NODE_EXECUTE,
          new Map<CommandFlag, string>([[flags.inputDir, temporaryDirectory], ...flagsMap.entries()]),
        ),
      );

      await accountManager.close();
    }).timeout(Duration.ofMinutes(10).toMillis());

    balanceQueryShouldSucceed(accountManager, namespace, remoteConfig, logger, nodeAlias);

    accountCreationShouldSucceed(accountManager, namespace, remoteConfig, logger, nodeAlias);

    it('deleted consensus node should not be running', async (): Promise<void> => {
      const pods: Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
      expect(pods.length).to.equal(2);
    }).timeout(Duration.ofMinutes(10).toMillis());
  });
}
