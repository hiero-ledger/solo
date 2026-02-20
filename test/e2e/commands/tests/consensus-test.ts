// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';

export class ConsensusTest extends BaseCommandTest {
  public static soloConsensusNetworkDestroyArgv(deployment: string): string[] {
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

  public static soloConsensusNetworkFreezeArgv(deployment: string): string[] {
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

  public static soloConsensusStateDownloadArgv(deployment: string, nodeAliasesUnparsed: string): string[] {
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

  public static soloConsensusNodeRestartArgv(deployment: string, nodeAliasesUnparsed?: string): string[] {
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
}
