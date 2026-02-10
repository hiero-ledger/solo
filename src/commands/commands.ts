// SPDX-License-Identifier: Apache-2.0

import {type InitCommand} from './init/init.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {type CommandDefinition} from '../types/index.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {BlockCommandDefinition} from './command-definitions/block-command-definition.js';
import {ClusterReferenceCommandDefinition} from './command-definitions/cluster-reference-command-definition.js';
import {ConsensusCommandDefinition} from './command-definitions/consensus-command-definition.js';
import {MirrorCommandDefinition} from './command-definitions/mirror-command-definition.js';
import {OneShotCommandDefinition} from './command-definitions/one-shot-command-definition.js';
import {LedgerCommandDefinition} from './command-definitions/ledger-command-definition.js';
import {KeysCommandDefinition} from './command-definitions/keys-command-definition.js';
import {ExplorerCommandDefinition} from './command-definitions/explorer-command-definition.js';
import {DeploymentCommandDefinition} from './command-definitions/deployment-command-definition.js';
import {RelayCommandDefinition} from './command-definitions/relay-command-definition.js';
import {RapidFireCommandDefinition} from './command-definitions/rapid-fire-command-definition.js';
import {BackupRestoreCommandDefinition} from './command-definitions/backup-restore-command-definition.js';
import {DebugCommandDefinition} from './command-definitions/debug-command-definition.js';

/**
 * Return a list of Yargs command builder to be exposed through CLI
 * @returns an array of Yargs command builder
 */
@injectable()
export class Commands {
  public constructor(
    @inject(InjectTokens.InitCommand) private readonly init?: InitCommand,
    @inject(InjectTokens.BackupRestoreCommandDefinition)
    private readonly backupRestore?: BackupRestoreCommandDefinition,
    @inject(InjectTokens.BlockCommandDefinition) private readonly block?: BlockCommandDefinition,
    @inject(InjectTokens.ClusterReferenceCommandDefinition)
    private readonly cluster?: ClusterReferenceCommandDefinition,
    @inject(InjectTokens.ConsensusCommandDefinition) private readonly consensus?: ConsensusCommandDefinition,
    @inject(InjectTokens.DebugCommandDefinition) private readonly debug?: DebugCommandDefinition,
    @inject(InjectTokens.DeploymentCommandDefinition) private readonly deployment?: DeploymentCommandDefinition,
    @inject(InjectTokens.ExplorerCommandDefinition) private readonly explorer?: ExplorerCommandDefinition,
    @inject(InjectTokens.KeysCommandDefinition) private readonly keys?: KeysCommandDefinition,
    @inject(InjectTokens.LedgerCommandDefinition) private readonly ledger?: LedgerCommandDefinition,
    @inject(InjectTokens.MirrorCommandDefinition) private readonly mirror?: MirrorCommandDefinition,
    @inject(InjectTokens.RelayCommandDefinition) private readonly relay?: RelayCommandDefinition,
    @inject(InjectTokens.OneShotCommandDefinition) private readonly oneShot?: OneShotCommandDefinition,
    @inject(InjectTokens.RapidFireCommandDefinition) private readonly rapidFire?: RapidFireCommandDefinition,
  ) {
    this.init = patchInject(init, InjectTokens.InitCommand, this.constructor.name);
    this.backupRestore = patchInject(backupRestore, InjectTokens.BackupRestoreCommandDefinition, this.constructor.name);
    this.block = patchInject(block, InjectTokens.BlockCommandDefinition, this.constructor.name);
    this.cluster = patchInject(cluster, InjectTokens.ClusterReferenceCommandDefinition, this.constructor.name);
    this.consensus = patchInject(consensus, InjectTokens.ConsensusCommandDefinition, this.constructor.name);
    this.debug = patchInject(debug, InjectTokens.DebugCommandDefinition, this.constructor.name);
    this.deployment = patchInject(deployment, InjectTokens.DeploymentCommandDefinition, this.constructor.name);
    this.explorer = patchInject(explorer, InjectTokens.ExplorerCommandDefinition, this.constructor.name);
    this.keys = patchInject(keys, InjectTokens.KeysCommandDefinition, this.constructor.name);
    this.ledger = patchInject(ledger, InjectTokens.LedgerCommandDefinition, this.constructor.name);
    this.mirror = patchInject(mirror, InjectTokens.MirrorCommandDefinition, this.constructor.name);
    this.oneShot = patchInject(oneShot, InjectTokens.OneShotCommandDefinition, this.constructor.name);
    this.rapidFire = patchInject(rapidFire, InjectTokens.RapidFireCommandDefinition, this.constructor.name);
  }

  public getCommandDefinitions(): CommandDefinition[] {
    return [
      this.init.getCommandDefinition(),
      this.backupRestore.getCommandDefinition(),
      this.block.getCommandDefinition(),
      this.cluster.getCommandDefinition(),
      this.consensus.getCommandDefinition(),
      this.debug.getCommandDefinition(),
      this.deployment.getCommandDefinition(),
      this.explorer.getCommandDefinition(),
      this.keys.getCommandDefinition(),
      this.ledger.getCommandDefinition(),
      this.mirror.getCommandDefinition(),
      this.relay.getCommandDefinition(),
      this.oneShot.getCommandDefinition(),
      this.rapidFire.getCommandDefinition(),
    ];
  }
}
