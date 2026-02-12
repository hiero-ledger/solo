// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';

export class NodeAddTest extends BaseCommandTest {
  public static soloNodeAddPrepareArgv(
    deployment: string,
    outputDirectory: string,
    cacheDirectory: string,
    options: {
      persistentVolumeClaims?: boolean;
      generateGossipKeys?: boolean;
      generateTlsKeys?: boolean;
    },
  ): string[] {
    const {newArgv, optionFromFlag} = NodeAddTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_PREPARE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.outputDir),
      outputDirectory,
    );

    if (options.persistentVolumeClaims) {
      argv.push(optionFromFlag(Flags.persistentVolumeClaims));
    }

    if (options.generateGossipKeys) {
      argv.push(optionFromFlag(Flags.generateGossipKeys));
    }

    if (options.generateTlsKeys) {
      argv.push(optionFromFlag(Flags.generateTlsKeys));
    }

    argv.push(optionFromFlag(Flags.cacheDir), cacheDirectory);

    return argv;
  }

  public static soloNodeAddSubmitArgv(deployment: string, inputDirectory: string): string[] {
    const {newArgv, optionFromFlag} = NodeAddTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.inputDir),
      inputDirectory,
    );

    return argv;
  }

  public static soloNodeAddExecuteArgv(deployment: string, inputDirectory: string, cacheDirectory: string): string[] {
    const {newArgv, optionFromFlag} = NodeAddTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_EXECUTE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.inputDir),
      inputDirectory,
      optionFromFlag(Flags.cacheDir),
      cacheDirectory,
    );

    return argv;
  }
}
