// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {LedgerCommandDefinition} from '../../../../src/commands/command-definitions/ledger-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';

export class NodeAddLocalTest extends BaseCommandTest {
  public static soloNetworkDestroyArgv(deployment: string): string[] {
    const {newArgv, optionFromFlag} = NodeAddLocalTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.deletePvcs),
      optionFromFlag(Flags.deleteSecrets),
      optionFromFlag(Flags.force),
    );

    return argv;
  }

  public static soloFileCreateArgv(deployment: string, filePath: string): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeAddLocalTest;

    const argv: string[] = newArgv();
    argv.push(
      LedgerCommandDefinition.COMMAND_NAME,
      LedgerCommandDefinition.FILE_SUBCOMMAND_NAME,
      LedgerCommandDefinition.FILE_CREATE,
      optionFromFlag(Flags.filePath),
      filePath,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    argvPushGlobalFlags(argv, deployment, false, true);
    return argv;
  }

  public static soloFileUpdateArgv(deployment: string, fileId: string, filePath: string): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = NodeAddLocalTest;

    const argv: string[] = newArgv();
    argv.push(
      LedgerCommandDefinition.COMMAND_NAME,
      LedgerCommandDefinition.FILE_SUBCOMMAND_NAME,
      LedgerCommandDefinition.FILE_UPDATE,
      optionFromFlag(Flags.fileId),
      fileId,
      optionFromFlag(Flags.filePath),
      filePath,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    argvPushGlobalFlags(argv, deployment, false, true);
    return argv;
  }
}
