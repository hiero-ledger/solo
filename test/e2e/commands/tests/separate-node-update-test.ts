// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';

export class SeparateNodeUpdateTest extends BaseCommandTest {
  public static soloNodeUpdatePrepareArgv(
    deployment: string,
    outputDir: string,
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
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = SeparateNodeUpdateTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_PREPARE,
      optionFromFlag(Flags.outputDir),
      outputDir,
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
    );

    argvPushGlobalFlags(argv, deployment, false, true);
    return argv;
  }

  public static soloNodeUpdateSubmitArgv(deployment: string, inputDir: string): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = SeparateNodeUpdateTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
      optionFromFlag(Flags.inputDir),
      inputDir,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    argvPushGlobalFlags(argv, deployment, false, true);
    return argv;
  }

  public static soloNodeUpdateExecuteArgv(deployment: string, inputDir: string): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = SeparateNodeUpdateTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_UPDATE_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_EXECUTE,
      optionFromFlag(Flags.inputDir),
      inputDir,
      optionFromFlag(Flags.deployment),
      deployment,
    );

    argvPushGlobalFlags(argv, deployment, false, true);
    return argv;
  }
}
