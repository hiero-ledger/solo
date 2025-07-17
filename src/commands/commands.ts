// SPDX-License-Identifier: Apache-2.0

import {type ClusterCommand} from './cluster/index.js';
import {type InitCommand} from './init/init.js';
import {type MirrorNodeCommand} from './mirror-node.js';
import {type NetworkCommand} from './network.js';
import {type NodeCommand} from './node/index.js';
import {type RelayCommand} from './relay.js';
import {type AccountCommand} from './account.js';
import {type DeploymentCommand} from './deployment.js';
import {type ExplorerCommand} from './explorer.js';
import {type BlockNodeCommand} from './block-node.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type QuickStartCommand} from './quick-start/quick-start.js';
import {type CommandDefinition} from '../types/index.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {CommandDefinitionBuilder} from './command-definition-builder.js';

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @returns an array of Yargs command builder
 */
@injectable()
export class Commands {
  public constructor(
    @inject(InjectTokens.InitCommand) public readonly initCommand?: InitCommand,
    @inject(InjectTokens.ClusterCommand) public readonly clusterCommand?: ClusterCommand,
    @inject(InjectTokens.NetworkCommand) public readonly networkCommand?: NetworkCommand,
    @inject(InjectTokens.NodeCommand) public readonly nodeCommand?: NodeCommand,
    @inject(InjectTokens.RelayCommand) public readonly relayCommand?: RelayCommand,
    @inject(InjectTokens.AccountCommand) public readonly accountCommand?: AccountCommand,
    @inject(InjectTokens.MirrorNodeCommand) public readonly mirrorNodeCommand?: MirrorNodeCommand,
    @inject(InjectTokens.ExplorerCommand) public readonly explorerCommand?: ExplorerCommand,
    @inject(InjectTokens.DeploymentCommand) public readonly deploymentCommand?: DeploymentCommand,
    @inject(InjectTokens.BlockNodeCommand) public readonly blockNodeCommand?: BlockNodeCommand,
    @inject(InjectTokens.QuickStartCommand) public readonly quickStartCommand?: QuickStartCommand,
  ) {
    this.initCommand = patchInject(initCommand, InjectTokens.InitCommand, this.constructor.name);
    this.clusterCommand = patchInject(clusterCommand, InjectTokens.ClusterCommand, this.constructor.name);
    this.networkCommand = patchInject(networkCommand, InjectTokens.NetworkCommand, this.constructor.name);
    this.nodeCommand = patchInject(nodeCommand, InjectTokens.NodeCommand, this.constructor.name);
    this.relayCommand = patchInject(relayCommand, InjectTokens.RelayCommand, this.constructor.name);
    this.accountCommand = patchInject(accountCommand, InjectTokens.AccountCommand, this.constructor.name);
    this.mirrorNodeCommand = patchInject(mirrorNodeCommand, InjectTokens.MirrorNodeCommand, this.constructor.name);
    this.explorerCommand = patchInject(explorerCommand, InjectTokens.ExplorerCommand, this.constructor.name);
    this.deploymentCommand = patchInject(deploymentCommand, InjectTokens.DeploymentCommand, this.constructor.name);
    this.blockNodeCommand = patchInject(blockNodeCommand, InjectTokens.BlockNodeCommand, this.constructor.name);
    this.quickStartCommand = patchInject(quickStartCommand, InjectTokens.QuickStartCommand, this.constructor.name);
  }

  public getCommandDefinitions(): CommandDefinition[] {
    const commandDefinitionBuilder: CommandDefinitionBuilder = new CommandDefinitionBuilder(
      this.blockNodeCommand.logger,
    );
    return [
      this.initCommand.getCommandDefinition(),
      this.accountCommand.getCommandDefinition(),
      this.clusterCommand.getCommandDefinition(),
      this.relayCommand.getCommandDefinition(),
      this.mirrorNodeCommand.getCommandDefinition(),
      this.explorerCommand.getCommandDefinition(),
      this.deploymentCommand.getCommandDefinition(),
      this.blockNodeCommand.getCommandDefinition(),
      this.quickStartCommand.getCommandDefinition(),
      commandDefinitionBuilder.getConsensusCommandDefinition(this.networkCommand, this.nodeCommand),
    ];
  }
}
