// SPDX-License-Identifier: Apache-2.0

import {type ClusterCommand} from './cluster/index.js';
import {type InitCommand} from './init.js';
import {type MirrorNodeCommand} from './mirror-node.js';
import {type NetworkCommand} from './network.js';
import {type NodeCommand} from './node/index.js';
import {type RelayCommand} from './relay.js';
import {type AccountCommand} from './account.js';
import {type DeploymentCommand} from './deployment.js';
import {type ExplorerCommand} from './explorer.js';
import {type BlockNodeCommand} from './block-node.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type CommandDefinition} from '../types/index.js';

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @returns an array of Yargs command builder
 */
export function Initialize(): CommandDefinition[] {
  const initCmd: InitCommand = container.resolve(InjectTokens.InitCommand);
  const clusterCmd: ClusterCommand = container.resolve(InjectTokens.ClusterCommand);
  const networkCommand: NetworkCommand = container.resolve(InjectTokens.NetworkCommand);
  const nodeCmd: NodeCommand = container.resolve(InjectTokens.NodeCommand);
  const relayCmd: RelayCommand = container.resolve(InjectTokens.RelayCommand);
  const accountCmd: AccountCommand = container.resolve(InjectTokens.AccountCommand);
  const mirrorNodeCmd: MirrorNodeCommand = container.resolve(InjectTokens.MirrorNodeCommand);
  const explorerCommand: ExplorerCommand = container.resolve(InjectTokens.ExplorerCommand);
  const deploymentCommand: DeploymentCommand = container.resolve(InjectTokens.DeploymentCommand);
  const blockNodeCommand: BlockNodeCommand = container.resolve(InjectTokens.BlockNodeCommand);

  return [
    initCmd.getCommandDefinition(),
    accountCmd.getCommandDefinition(),
    clusterCmd.getCommandDefinition(),
    networkCommand.getCommandDefinition(),
    nodeCmd.getCommandDefinition(),
    relayCmd.getCommandDefinition(),
    mirrorNodeCmd.getCommandDefinition(),
    explorerCommand.getCommandDefinition(),
    deploymentCommand.getCommandDefinition(),
    blockNodeCommand.getCommandDefinition(),
  ];
}
