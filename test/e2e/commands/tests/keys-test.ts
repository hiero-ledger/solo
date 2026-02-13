// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {KeysCommandDefinition} from '../../../../src/commands/command-definitions/keys-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';

export class KeysTest extends BaseCommandTest {
  public static soloConsensusGenerate(
    deployment: string,
    nodeAliasesUnparsed: string,
    cacheDirectory: string,
  ): string[] {
    const {newArgv, optionFromFlag} = KeysTest;

    const argv: string[] = newArgv();
    argv.push(
      KeysCommandDefinition.COMMAND_NAME,
      KeysCommandDefinition.CONSENSUS_SUBCOMMAND_NAME,
      KeysCommandDefinition.CONSENSUS_GENERATE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.generateGossipKeys),
      optionFromFlag(Flags.generateTlsKeys),
      optionFromFlag(Flags.nodeAliasesUnparsed),
      nodeAliasesUnparsed,
      optionFromFlag(Flags.cacheDir),
      cacheDirectory,
    );

    return argv;
  }
}
