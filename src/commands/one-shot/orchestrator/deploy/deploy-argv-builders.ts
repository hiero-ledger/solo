// SPDX-License-Identifier: Apache-2.0

import {
  type OneShotSingleDeployConfigClass,
  type OneShotVersionsObject,
} from '../../one-shot-single-deploy-config-class.js';
import {BlockCommandDefinition} from '../../../command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from '../../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../../command-definitions/relay-command-definition.js';
import {ConsensusCommandDefinition} from '../../../command-definitions/consensus-command-definition.js';
import {ClusterReferenceCommandDefinition} from '../../../command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../../../command-definitions/deployment-command-definition.js';
import {KeysCommandDefinition} from '../../../command-definitions/keys-command-definition.js';
import {Flags} from '../../../flags.js';
import {appendConfigToArgv, argvPushGlobalFlags, newArgv, optionFromFlag} from '../../../command-helpers.js';
import * as constants from '../../../../core/constants.js';
import * as version from '../../../../../version.js';
import {type AnyObject} from '../../../../types/aliases.js';

const MIRROR_NODE_ID: number = 1;

export class DeployArgvBuilders {
  public static buildBlockNodeArgv(config: OneShotSingleDeployConfigClass): string[] {
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

  public static buildMirrorNodeArgv(config: OneShotSingleDeployConfigClass): string[] {
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
      [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
      ...config.mirrorNodeConfiguration,
      '--values-file': mirrorExistingValuesFile
        ? `${mirrorExistingValuesFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`
        : constants.MIRROR_NODE_HIKARI_LIMITS_FILE,
    };
    appendConfigToArgv(argv, mirrorLocalConfig);
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static buildExplorerArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
    );
    appendConfigToArgv(argv, {
      [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
      [optionFromFlag(Flags.explorerVersion)]: config.versions.explorer,
      [optionFromFlag(Flags.mirrorNodeId)]: MIRROR_NODE_ID,
      [optionFromFlag(Flags.mirrorNamespace)]: config.namespace.name,
      ...config.explorerNodeConfiguration,
    });
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static buildRelayArgv(config: OneShotSingleDeployConfigClass): string[] {
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
      [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
      [optionFromFlag(Flags.mirrorNodeId)]: MIRROR_NODE_ID,
      [optionFromFlag(Flags.mirrorNamespace)]: config.namespace.name,
      ...config.relayNodeConfiguration,
    });
    return argvPushGlobalFlags(argv);
  }

  public static buildConsensusDeployArgv(config: OneShotSingleDeployConfigClass): string[] {
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

  public static buildConsensusSetupArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ConsensusCommandDefinition.SETUP_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
    );
    appendConfigToArgv(argv, config.setupConfiguration);
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static buildConsensusStartArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ConsensusCommandDefinition.START_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
    );
    appendConfigToArgv(argv, {
      [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
      ...config.consensusNodeConfiguration,
    });
    return argvPushGlobalFlags(argv);
  }

  public static buildClusterConnectArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ClusterReferenceCommandDefinition.CONNECT_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.context),
      config.context,
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildDeploymentCreateArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...DeploymentCommandDefinition.CREATE_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.namespace),
      config.namespace.name,
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildDeploymentAttachArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...DeploymentCommandDefinition.ATTACH_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
      optionFromFlag(Flags.numberOfConsensusNodes),
      config.numberOfConsensusNodes.toString(),
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildClusterSetupArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ClusterReferenceCommandDefinition.SETUP_COMMAND.split(' '),
      optionFromFlag(Flags.clusterRef),
      config.clusterRef,
    );
    return argvPushGlobalFlags(argv);
  }

  public static buildKeysGenerateArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...KeysCommandDefinition.KEYS_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
      optionFromFlag(Flags.generateGossipKeys),
      'true',
      optionFromFlag(Flags.generateTlsKeys),
    );
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public static resolveOneShotComponentVersions(useEdge: boolean): OneShotVersionsObject {
    return useEdge
      ? {
          soloChart: version.SOLO_CHART_EDGE_VERSION,
          consensus: version.HEDERA_PLATFORM_EDGE_VERSION,
          mirror: version.MIRROR_NODE_EDGE_VERSION,
          explorer: version.EXPLORER_EDGE_VERSION,
          relay: version.HEDERA_JSON_RPC_RELAY_EDGE_VERSION,
          blockNode: version.BLOCK_NODE_EDGE_VERSION,
        }
      : {
          soloChart: version.SOLO_CHART_VERSION,
          consensus: version.HEDERA_PLATFORM_VERSION,
          mirror: version.MIRROR_NODE_VERSION,
          explorer: version.EXPLORER_VERSION,
          relay: version.HEDERA_JSON_RPC_RELAY_VERSION,
          blockNode: version.BLOCK_NODE_VERSION,
        };
  }
}
