// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {LedgerCommandDefinition} from '../../../../src/commands/command-definitions/ledger-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';

export class ConsensusTest extends BaseCommandTest {
  public static soloNetworkDestroyArgv(deployment: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusTest;

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

  public static soloNetworkFreezeArgv(deployment: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NETWORK_FREEZE,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    return argv;
  }

  public static soloStateDownloadArgv(deployment: string, nodeAliasesUnparsed: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.STATE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.STATE_DOWNLOAD,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      nodeAliasesUnparsed,
    );

    return argv;
  }

  public static soloNodeRestartArgv(deployment: string, nodeAliasesUnparsed?: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.NODE_RESTART,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    if (nodeAliasesUnparsed) {
      argv.push(optionFromFlag(Flags.nodeAliasesUnparsed), nodeAliasesUnparsed);
    }

    return argv;
  }

  public static soloLedgerFileCreateArgv(deployment: string, filePath: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusTest;

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

    return argv;
  }

  public static soloLedgerFileUpdateArgv(deployment: string, fileId: string, filePath: string): string[] {
    const {newArgv, optionFromFlag} = ConsensusTest;

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

    return argv;
  }
}
