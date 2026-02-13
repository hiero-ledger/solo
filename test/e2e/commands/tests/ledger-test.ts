// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {LedgerCommandDefinition} from '../../../../src/commands/command-definitions/ledger-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';

export class LedgerTest extends BaseCommandTest {
  public static soloLedgerInitArgv(deployment: string, nodeAliases: string, clusterReference: string): string[] {
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

  public static soloAccountCreateArgv(deployment: string): string[] {
    const {newArgv, optionFromFlag} = LedgerTest;

    const argv: string[] = newArgv();
    argv.push(
      LedgerCommandDefinition.COMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_SUBCOMMAND_NAME,
      LedgerCommandDefinition.ACCOUNT_CREATE,
      '--deployment',
      deployment,
    );

    return argv;
  }
}
