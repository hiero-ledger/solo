// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {LedgerCommandDefinition} from '../../../../src/commands/command-definitions/ledger-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';

export class LedgerTest extends BaseCommandTest {
  public static soloLedgerSystemInitArgv(deployment: string, nodeAliases: string, clusterReference: string): string[] {
    const {newArgv, optionFromFlag} = LedgerTest;

    const argv: string[] = newArgv();
    argv.push(
      LedgerCommandDefinition.COMMAND_NAME,
      LedgerCommandDefinition.SYSTEM_SUBCOMMAND_NAME,
      LedgerCommandDefinition.SYSTEM_INIT,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      nodeAliases,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
    );

    return argv;
  }

  public static soloLedgerAccountCreateArgv(deployment: string): string[] {
    const {newArgv, optionFromFlag} = LedgerTest;

    const argv: string[] = newArgv();
    argv.push(
      LedgerCommandDefinition.COMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_CREATE,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    return argv;
  }

  public static soloLedgerFileCreateArgv(deployment: string, filePath: string): string[] {
    const {newArgv, optionFromFlag} = LedgerTest;

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
    const {newArgv, optionFromFlag} = LedgerTest;

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
