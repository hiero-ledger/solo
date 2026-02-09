// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {LedgerCommandDefinition} from '../../../../src/commands/command-definitions/ledger-command-definition.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {Flags} from '../../../../src/commands/flags.js';

export class SeparateNodeAddTest extends BaseCommandTest {
  public static soloLedgerInitArgv(
    deployment: string,
    nodeAliases: string,
    clusterReference: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = SeparateNodeAddTest;

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

    argvPushGlobalFlags(argv, deployment, false, true);
    return argv;
  }

  public static soloNodeAddPrepareArgv(
    deployment: string,
    outputDir: string,
    options: {
      persistentVolumeClaims?: boolean;
      generateGossipKeys?: boolean;
      generateTlsKeys?: boolean;
    },
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = SeparateNodeAddTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_PREPARE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.outputDir),
      outputDir,
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

    argvPushGlobalFlags(argv, deployment, false, true);
    return argv;
  }

  public static soloNodeAddSubmitArgv(deployment: string, inputDir: string): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = SeparateNodeAddTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_SUBMIT_TRANSACTION,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.inputDir),
      inputDir,
    );

    argvPushGlobalFlags(argv, deployment, false, true);
    return argv;
  }

  public static soloNodeAddExecuteArgv(deployment: string, inputDir: string): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = SeparateNodeAddTest;

    const argv: string[] = newArgv();
    argv.push(
      ConsensusCommandDefinition.COMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_ADD_SUBCOMMAND_NAME,
      ConsensusCommandDefinition.DEV_NODE_EXECUTE,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.inputDir),
      inputDir,
    );

    argvPushGlobalFlags(argv, deployment, false, true);
    return argv;
  }
}
