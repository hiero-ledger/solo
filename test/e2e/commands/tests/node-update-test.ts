// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';

export class NodeUpdateTest extends BaseCommandTest {
  public static soloNodeUpdatePrepareArgv(
    deployment: string,
    outputDirectory: string,
    cacheDirectory: string,
    options: {
      nodeAlias: NodeAlias;
      newAdminKey: string;
      newAccountNumber: string;
      tlsPublicKey: string;
      tlsPrivateKey: string;
      gossipPublicKey: string;
      gossipPrivateKey: string;
    },
  ): string[] {
    const {newArgv, optionFromFlag} = NodeUpdateTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_PREPARE,
      optionFromFlag(Flags.outputDir),
      outputDirectory,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.nodeAlias),
      options.nodeAlias,
      optionFromFlag(Flags.newAdminKey),
      options.newAdminKey,
      optionFromFlag(Flags.newAccountNumber),
      options.newAccountNumber,
      optionFromFlag(Flags.tlsPublicKey),
      options.tlsPublicKey,
      optionFromFlag(Flags.tlsPrivateKey),
      options.tlsPrivateKey,
      optionFromFlag(Flags.gossipPublicKey),
      options.gossipPublicKey,
      optionFromFlag(Flags.gossipPrivateKey),
      options.gossipPrivateKey,
      optionFromFlag(Flags.cacheDir),
      cacheDirectory,
    );

    return argv;
  }

  public static soloNodeUpdateSubmitArgv(deployment: string, inputDirectory: string, cacheDirectory: string): string[] {
    const {newArgv, optionFromFlag} = NodeUpdateTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
      optionFromFlag(Flags.inputDir),
      inputDirectory,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.cacheDir),
      cacheDirectory,
    );

    return argv;
  }

  public static soloNodeUpdateExecuteArgv(
    deployment: string,
    inputDirectory: string,
    cacheDirectory: string,
  ): string[] {
    const {newArgv, optionFromFlag} = NodeUpdateTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_EXECUTE,
      optionFromFlag(Flags.inputDir),
      inputDirectory,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.cacheDir),
      cacheDirectory,
    );

    return argv;
  }
}
