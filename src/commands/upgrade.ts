// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type ArgvStruct} from '../types/aliases.js';
import {type DeploymentName, type SoloListr} from '../types/index.js';
import {type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {type MirrorNodeCommand} from './mirror-node.js';
import {type RelayCommand} from './relay.js';
import {type ExplorerCommand} from './explorer.js';
import {type BlockNodeCommand} from './block-node.js';
import {type NodeCommandHandlers} from './node/handlers.js';
import {MirrorNodeStateSchema} from '../data/schema/model/remote/state/mirror-node-state-schema.js';
import {RelayNodeStateSchema} from '../data/schema/model/remote/state/relay-node-state-schema.js';
import {ExplorerStateSchema} from '../data/schema/model/remote/state/explorer-state-schema.js';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {ConsensusNodeStateSchema} from '../data/schema/model/remote/state/consensus-node-state-schema.js';
import {SemVer} from 'semver';

interface UpgradeAllConfigClass {
  deployment: DeploymentName;
  quiet: boolean;
}

interface UpgradeAllContext {
  config: UpgradeAllConfigClass;
}

@injectable()
export class UpgradeCommand extends BaseCommand {
  public constructor(
    @inject(InjectTokens.MirrorNodeCommand) private readonly mirrorNodeCommand?: MirrorNodeCommand,
    @inject(InjectTokens.RelayCommand) private readonly relayCommand?: RelayCommand,
    @inject(InjectTokens.ExplorerCommand) private readonly explorerCommand?: ExplorerCommand,
    @inject(InjectTokens.BlockNodeCommand) private readonly blockNodeCommand?: BlockNodeCommand,
    @inject(InjectTokens.NodeCommandHandlers) private readonly nodeCommandHandlers?: NodeCommandHandlers,
  ) {
    super();
    this.mirrorNodeCommand = patchInject(mirrorNodeCommand, InjectTokens.MirrorNodeCommand, this.constructor.name);
    this.relayCommand = patchInject(relayCommand, InjectTokens.RelayCommand, this.constructor.name);
    this.explorerCommand = patchInject(explorerCommand, InjectTokens.ExplorerCommand, this.constructor.name);
    this.blockNodeCommand = patchInject(blockNodeCommand, InjectTokens.BlockNodeCommand, this.constructor.name);
    this.nodeCommandHandlers = patchInject(
      nodeCommandHandlers,
      InjectTokens.NodeCommandHandlers,
      this.constructor.name,
    );
  }

  public async close(): Promise<void> {
    // No cleanup needed
  }

  public static readonly UPGRADE_ALL_FLAGS_LIST: CommandFlags = {
    required: [flags.deployment],
    optional: [flags.quiet, flags.latest],
  };

  private static readonly UPGRADE_ALL_CONFIGS_NAME = 'upgradeAllConfig';

  /**
   * Upgrades all network components to their latest versions
   * @param argv - command arguments
   */
  public async all(argv: ArgvStruct): Promise<boolean> {
    let lease: Lock;

    const tasks: SoloListr<UpgradeAllContext> = this.taskList.newTaskList<UpgradeAllContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            await this.localConfig.load();
            await this.remoteConfig.loadAndValidate(argv);
            lease = await this.leaseManager.create();

            this.configManager.update(argv);

            flags.disablePrompts(UpgradeCommand.UPGRADE_ALL_FLAGS_LIST.optional);

            const allFlags = [
              ...UpgradeCommand.UPGRADE_ALL_FLAGS_LIST.required,
              ...UpgradeCommand.UPGRADE_ALL_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const config: UpgradeAllConfigClass = this.configManager.getConfig(
              UpgradeCommand.UPGRADE_ALL_CONFIGS_NAME,
              allFlags,
              [],
            ) as UpgradeAllConfigClass;

            context_.config = config;

            // Force --latest flag to be true for all component upgrades
            this.configManager.setFlag(flags.latest, true);
          },
        },
        {
          title: 'Upgrade Consensus Nodes',
          task: async (_context_): Promise<void> => {
            try {
              const consensusNodes =
                this.remoteConfig.configuration.components.getComponentByType<ConsensusNodeStateSchema>(
                  ComponentTypes.ConsensusNode,
                );

              if (consensusNodes.length === 0) {
                this.logger.info('No consensus nodes found, skipping');
                return;
              }

              // Check if upgrade is needed
              // Note: For consensus nodes, we skip version checking since fetching latest from
              // builds.hedera.com is not yet implemented. We'll attempt upgrade and let the
              // individual command handle it (will fail with helpful error message)
              const currentVersion: SemVer | null = this.remoteConfig.getComponentVersion(ComponentTypes.ConsensusNode);

              this.logger.info(
                `Attempting to upgrade consensus nodes from ${currentVersion ? currentVersion.version : 'unknown'} ` +
                  '(Note: --latest for consensus nodes requires explicit version specification)',
              );

              // Create a new argv for the upgrade command with all necessary flags
              const upgradeArgv: ArgvStruct = {
                ...argv,
                flags: {
                  ...argv.flags,
                  [flags.latest.name]: true,
                },
              };

              await this.nodeCommandHandlers.upgrade(upgradeArgv);
            } catch (error) {
              if (error.message.includes('not found') || error.message.includes('does not exist')) {
                this.logger.info('Consensus nodes not deployed, skipping');
              } else {
                throw error;
              }
            }
          },
        },
        {
          title: 'Upgrade Mirror Node',
          task: async (_context_): Promise<void> => {
            try {
              const mirrorNodes: MirrorNodeStateSchema[] =
                this.remoteConfig.configuration.components.getComponentByType<MirrorNodeStateSchema>(
                  ComponentTypes.MirrorNode,
                );

              if (mirrorNodes.length === 0) {
                this.logger.info('No mirror nodes found, skipping');
                return;
              }

              const currentVersion: SemVer | null = this.remoteConfig.getComponentVersion(ComponentTypes.MirrorNode);

              // Fetch latest version dynamically
              const {VersionHelper} = await import('../core/helpers/version-helper.js');
              const latestVersion: string = await VersionHelper.fetchLatestVersion(
                this.logger,
                constants.MIRROR_NODE_CHART_URL,
                constants.MIRROR_NODE_CHART,
              );

              if (currentVersion && currentVersion.version === latestVersion) {
                this.logger.info(`Mirror node already at latest version ${latestVersion}, skipping`);
                return;
              }

              this.logger.info(
                `Upgrading mirror node from ${currentVersion ? currentVersion.version : 'unknown'} to ${latestVersion}`,
              );

              const upgradeArgv: ArgvStruct = {
                ...argv,
                flags: {
                  ...argv.flags,
                  [flags.mirrorNodeVersion.name]: latestVersion,
                  [flags.latest.name]: true,
                },
              };

              await this.mirrorNodeCommand.upgrade(upgradeArgv);
            } catch (error) {
              if (error.message.includes('not found') || error.message.includes('does not exist')) {
                this.logger.info('Mirror node not deployed, skipping');
              } else {
                throw error;
              }
            }
          },
        },
        {
          title: 'Upgrade Relay',
          task: async (_context_): Promise<void> => {
            try {
              const relayNodes: RelayNodeStateSchema[] =
                this.remoteConfig.configuration.components.getComponentByType<RelayNodeStateSchema>(
                  ComponentTypes.RelayNodes,
                );

              if (relayNodes.length === 0) {
                this.logger.info('No relay nodes found, skipping');
                return;
              }

              const currentVersion: SemVer | null = this.remoteConfig.getComponentVersion(ComponentTypes.RelayNodes);

              // Fetch latest version dynamically
              const {VersionHelper} = await import('../core/helpers/version-helper.js');
              const latestVersion: string = await VersionHelper.fetchLatestVersion(
                this.logger,
                constants.JSON_RPC_RELAY_CHART_URL,
                constants.JSON_RPC_RELAY_CHART,
              );

              if (currentVersion && currentVersion.version === latestVersion) {
                this.logger.info(`Relay node already at latest version ${latestVersion}, skipping`);
                return;
              }

              this.logger.info(
                `Upgrading relay node from ${currentVersion ? currentVersion.version : 'unknown'} to ${latestVersion}`,
              );

              const upgradeArgv: ArgvStruct = {
                ...argv,
                flags: {
                  ...argv.flags,
                  [flags.relayReleaseTag.name]: latestVersion,
                  [flags.latest.name]: true,
                },
              };

              await this.relayCommand.upgrade(upgradeArgv);
            } catch (error) {
              if (error.message.includes('not found') || error.message.includes('does not exist')) {
                this.logger.info('Relay node not deployed, skipping');
              } else {
                throw error;
              }
            }
          },
        },
        {
          title: 'Upgrade Explorer',
          task: async (_context_): Promise<void> => {
            try {
              const explorers: ExplorerStateSchema[] =
                this.remoteConfig.configuration.components.getComponentByType<ExplorerStateSchema>(
                  ComponentTypes.Explorer,
                );

              if (explorers.length === 0) {
                this.logger.info('No explorers found, skipping');
                return;
              }

              const currentVersion: SemVer | null = this.remoteConfig.getComponentVersion(ComponentTypes.Explorer);

              // Fetch latest version dynamically
              const {VersionHelper} = await import('../core/helpers/version-helper.js');
              const explorerChartName: string = 'hiero-explorer-chart';
              const latestVersion: string = await VersionHelper.fetchLatestVersion(
                this.logger,
                constants.EXPLORER_CHART_URL,
                explorerChartName,
              );

              if (currentVersion && currentVersion.version === latestVersion) {
                this.logger.info(`Explorer already at latest version ${latestVersion}, skipping`);
                return;
              }

              this.logger.info(
                `Upgrading explorer from ${currentVersion ? currentVersion.version : 'unknown'} to ${latestVersion}`,
              );

              const upgradeArgv: ArgvStruct = {
                ...argv,
                flags: {
                  ...argv.flags,
                  [flags.explorerVersion.name]: latestVersion,
                  [flags.latest.name]: true,
                },
              };

              await this.explorerCommand.upgrade(upgradeArgv);
            } catch (error) {
              if (error.message.includes('not found') || error.message.includes('does not exist')) {
                this.logger.info('Explorer not deployed, skipping');
              } else {
                throw error;
              }
            }
          },
        },
        {
          title: 'Upgrade Block Node',
          task: async (_context_): Promise<void> => {
            try {
              const blockNodes: BlockNodeStateSchema[] =
                this.remoteConfig.configuration.components.getComponentByType<BlockNodeStateSchema>(
                  ComponentTypes.BlockNode,
                );

              if (blockNodes.length === 0) {
                this.logger.info('No block nodes found, skipping');
                return;
              }

              const currentVersion: SemVer | null = this.remoteConfig.getComponentVersion(ComponentTypes.BlockNode);

              // Fetch latest version dynamically
              const {VersionHelper} = await import('../core/helpers/version-helper.js');
              const latestVersion: string = await VersionHelper.fetchLatestVersion(
                this.logger,
                constants.BLOCK_NODE_CHART_URL,
                constants.BLOCK_NODE_CHART,
              );

              if (currentVersion && currentVersion.version === latestVersion) {
                this.logger.info(`Block node already at latest version ${latestVersion}, skipping`);
                return;
              }

              this.logger.info(
                `Upgrading block node from ${currentVersion ? currentVersion.version : 'unknown'} to ${latestVersion}`,
              );

              const upgradeArgv: ArgvStruct = {
                ...argv,
                flags: {
                  ...argv.flags,
                  [flags.upgradeVersion.name]: latestVersion,
                  [flags.latest.name]: true,
                },
              };

              await this.blockNodeCommand.upgrade(upgradeArgv);
            } catch (error) {
              if (error.message.includes('not found') || error.message.includes('does not exist')) {
                this.logger.info('Block node not deployed, skipping');
              } else {
                throw error;
              }
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'upgrade all components',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
        this.logger.debug('All components have been upgraded');
      } catch (error) {
        throw new SoloError(`Error upgrading components: ${error.message}`, error);
      } finally {
        await lease?.release();
      }
    }

    return true;
  }
}
