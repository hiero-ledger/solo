// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';

export class NodeDestroyTest extends BaseCommandTest {
  public static soloNodeDeletePrepareArgv(deployment: string, outputDirectory: string, nodeAlias: NodeAlias): string[] {
    const {newArgv, optionFromFlag} = NodeDestroyTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_PREPARE,
      optionFromFlag(Flags.outputDir),
      outputDirectory,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAlias),
      nodeAlias,
    );

    return argv;
  }

  public static soloNodeDeleteSubmitArgv(deployment: string, inputDirectory: string, nodeAlias: NodeAlias): string[] {
    const {newArgv, optionFromFlag} = NodeDestroyTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
      optionFromFlag(Flags.inputDir),
      inputDirectory,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAlias),
      nodeAlias,
    );

    return argv;
  }

  public static soloNodeDeleteExecuteArgv(
    deployment: string,
    inputDirectory: string,
    nodeAlias: NodeAlias,
    cacheDirectory: string,
  ): string[] {
    const {newArgv, optionFromFlag} = NodeDestroyTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_DELETE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_EXECUTE,
      optionFromFlag(Flags.inputDir),
      inputDirectory,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAlias),
      nodeAlias,
      optionFromFlag(Flags.cacheDir),
      cacheDirectory,
    );

    return argv;
  }
}
