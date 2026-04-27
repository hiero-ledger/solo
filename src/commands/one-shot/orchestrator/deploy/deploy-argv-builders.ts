// SPDX-License-Identifier: Apache-2.0

import {type OneShotSingleDeployConfigClass} from '../../one-shot-single-deploy-config-class.js';
import {BlockCommandDefinition} from '../../../command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from '../../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../../command-definitions/relay-command-definition.js';
import {ConsensusCommandDefinition} from '../../../command-definitions/consensus-command-definition.js';
import {Flags} from '../../../flags.js';
import {appendConfigToArgv, argvPushGlobalFlags, newArgv, optionFromFlag} from '../../../command-helpers.js';
import * as constants from '../../../../core/constants.js';
import {type AnyObject} from '../../../../types/aliases.js';

const MIRROR_NODE_ID: number = 1;

export function buildBlockNodeArgv(config: OneShotSingleDeployConfigClass): string[] {
  const argv: string[] = newArgv();
  argv.push(...BlockCommandDefinition.ADD_COMMAND.split(' '), optionFromFlag(Flags.deployment), config.deployment);

  // Build a local copy with the dev image values file appended, without mutating
  // config.blockNodeConfiguration — it may be an alias for another section's object
  // (e.g. via YAML anchors), causing the values file to leak into other commands.
  const blockExistingValuesFile: string = config.blockNodeConfiguration?.['--values-file'];
  const blockLocalConfig: AnyObject = {
    ...config.blockNodeConfiguration,
    '--values-file': blockExistingValuesFile
      ? `${blockExistingValuesFile},${constants.BLOCK_NODE_SOLO_DEV_FILE}`
      : constants.BLOCK_NODE_SOLO_DEV_FILE,
  };
  appendConfigToArgv(argv, blockLocalConfig);
  return argvPushGlobalFlags(argv);
}

export function buildMirrorNodeArgv(config: OneShotSingleDeployConfigClass): string[] {
  const argv: string[] = newArgv();
  argv.push(
    ...MirrorCommandDefinition.ADD_COMMAND.split(' '),
    optionFromFlag(Flags.deployment),
    config.deployment,
    optionFromFlag(Flags.clusterRef),
    config.clusterRef,
    optionFromFlag(Flags.pinger),
    optionFromFlag(Flags.enableIngress),
    optionFromFlag(Flags.parallelDeploy),
    config.parallelDeploy.toString(),
  );
  // Append HikariCP limits file without mutating the shared config object.
  const mirrorExistingValuesFile: string = config.mirrorNodeConfiguration?.['--values-file'];
  const mirrorLocalConfig: AnyObject = {
    ...config.mirrorNodeConfiguration,
    '--values-file': mirrorExistingValuesFile
      ? `${mirrorExistingValuesFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`
      : constants.MIRROR_NODE_HIKARI_LIMITS_FILE,
  };
  appendConfigToArgv(argv, mirrorLocalConfig);
  return argvPushGlobalFlags(argv, config.cacheDir);
}

export function buildExplorerArgv(config: OneShotSingleDeployConfigClass): string[] {
  const argv: string[] = newArgv();
  argv.push(
    ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
    optionFromFlag(Flags.deployment),
    config.deployment,
    optionFromFlag(Flags.clusterRef),
    config.clusterRef,
  );
  appendConfigToArgv(argv, {
    [optionFromFlag(Flags.explorerVersion)]: config.versions.explorer,
    [optionFromFlag(Flags.mirrorNodeId)]: MIRROR_NODE_ID,
    [optionFromFlag(Flags.mirrorNamespace)]: config.namespace.name,
    ...config.explorerNodeConfiguration,
  });
  return argvPushGlobalFlags(argv, config.cacheDir);
}

export function buildRelayArgv(config: OneShotSingleDeployConfigClass): string[] {
  const argv: string[] = newArgv();
  argv.push(
    ...RelayCommandDefinition.ADD_COMMAND.split(' '),
    optionFromFlag(Flags.deployment),
    config.deployment,
    optionFromFlag(Flags.clusterRef),
    config.clusterRef,
    optionFromFlag(Flags.nodeAliasesUnparsed),
    'node1',
  );
  appendConfigToArgv(argv, {
    [optionFromFlag(Flags.mirrorNodeId)]: MIRROR_NODE_ID,
    [optionFromFlag(Flags.mirrorNamespace)]: config.namespace.name,
    ...config.relayNodeConfiguration,
  });
  return argvPushGlobalFlags(argv);
}

export function buildConsensusDeployArgv(config: OneShotSingleDeployConfigClass): string[] {
  const argv: string[] = newArgv();
  argv.push(
    ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
    optionFromFlag(Flags.deployment),
    config.deployment,
  );
  if (config.networkConfiguration) {
    appendConfigToArgv(argv, config.networkConfiguration);
  }
  return argvPushGlobalFlags(argv, config.cacheDir);
}

export function buildConsensusSetupArgv(config: OneShotSingleDeployConfigClass): string[] {
  const argv: string[] = newArgv();
  argv.push(
    ...ConsensusCommandDefinition.SETUP_COMMAND.split(' '),
    optionFromFlag(Flags.deployment),
    config.deployment,
  );
  appendConfigToArgv(argv, config.setupConfiguration);
  return argvPushGlobalFlags(argv, config.cacheDir);
}

export function buildConsensusStartArgv(config: OneShotSingleDeployConfigClass): string[] {
  const argv: string[] = newArgv();
  argv.push(
    ...ConsensusCommandDefinition.START_COMMAND.split(' '),
    optionFromFlag(Flags.deployment),
    config.deployment,
  );
  appendConfigToArgv(argv, config.consensusNodeConfiguration);
  return argvPushGlobalFlags(argv);
}
