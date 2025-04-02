// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as helpers from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {showVersionBanner} from '../core/helpers.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {type AnyListrContext, type AnyYargs, type ArgvStruct, type NodeAliases} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {type ClusterReference, type DeploymentName} from '../core/config/remote/types.js';
import {type CommandDefinition, type Optional, type SoloListrTask} from '../types/index.js';
import * as versions from '../../version.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {type NamespaceName} from '../integration/kube/resources/namespace/namespace-name.js';

interface BlockNodesDeployConfigClass {
  chartVersion: string;
  chartDirectory: string;
  clusterRef: ClusterReference;
  deployment: DeploymentName;
  devMode: boolean;
  domainName: Optional<string>;
  enableIngress: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  namespace: NamespaceName;
}

interface BlockNodesDeployContext {
  config: BlockNodesDeployConfigClass;
}

export class BlockNodesCommand extends BaseCommand {
  public static readonly COMMAND_NAME: string = 'block-nodes';

  private static readonly DEPLOY_CONFIGS_NAME: string = 'deployConfigs';

  private static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.blockNodesChartVersion,
      flags.chartDirectory,
      flags.clusterRef,
      flags.deployment,
      flags.devMode,
      flags.domainName,
      flags.enableIngress,
      flags.quiet,
      flags.valuesFile,
    ],
  };

  private async prepareValuesArgForBlockNodes(valuesFile: string): Promise<string> {
    let valuesArgument: string = '';

    // if (blockNodesRelease) valuesArgument += ` --set image.tag=${blockNodesRelease.replace(/^v/, '')}`;

    if (valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(valuesFile);
    }

    return valuesArgument;
  }

  private prepareReleaseName(nodeAliases: NodeAliases = []): string {
    let releaseName: string = 'block nodes'; // TODO

    for (const nodeAlias of nodeAliases) {
      releaseName += `-${nodeAlias}`;
    }

    return releaseName;
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<BlockNodesDeployContext> = new Listr<BlockNodesDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            // reset nodeAlias
            this.configManager.setFlag(flags.nodeAliasesUnparsed, '');

            this.configManager.update(argv);

            flags.disablePrompts([
              flags.valuesFile,
              flags.chartDirectory,
              flags.clusterRef,

            ]);

            const allFlags: CommandFlag[] = [
              ...BlockNodesCommand.DEPLOY_FLAGS_LIST.required,
              ...BlockNodesCommand.DEPLOY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            // prompt if inputs are empty and set it in the context
            context_.config = this.configManager.getConfig(BlockNodesCommand.DEPLOY_CONFIGS_NAME, allFlags, [
              'nodeAliases',
            ]) as BlockNodesDeployConfigClass;

            context_.config.namespace = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );
            context_.config.nodeAliases = helpers.parseNodeAliases(
              context_.config.nodeAliasesUnparsed,
              this.remoteConfigManager.getConsensusNodes(),
              this.configManager,
            );
            context_.config.releaseName = this.prepareReleaseName(context_.config.nodeAliases);

            if (context_.config.clusterRef) {
              const context: string = this.remoteConfigManager.getClusterRefs()[context_.config.clusterRef];
              if (context) context_.config.context = context;
            }

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Check chart is installed',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;

            config.isChartInstalled = await this.chartManager.isChartInstalled(
              config.namespace,
              config.releaseName,
              config.context,
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;

            config.valuesArg = await this.prepareValuesArgForBlockNodes(config.valuesFile);
          },
        },
        {
          title: 'Deploy BlockNodes',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;

            await this.chartManager.install(
              config.namespace,
              config.releaseName,
              constants.BLOCK_NODE_CHART,
              constants.BLOCK_NODE_CHART,
              '',
              config.valuesArg,
              config.context,
            );

            showVersionBanner(this.logger, config.releaseName, versions.BLOCK_NODE_VERSION);
          },
        },
        {
          title: 'Check block nodes are running',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;

            await this.k8Factory
              .getK8(config.context)
              .pods()
              .waitForRunningPhase(
                config.namespace,
                ['app=hedera-json-rpc-block nodes', `app.kubernetes.io/instance=${config.releaseName}`], // TODO
                constants.RELAY_PODS_RUNNING_MAX_ATTEMPTS,
                constants.RELAY_PODS_RUNNING_DELAY,
              );
          },
        },
        {
          title: 'Check block nodes is ready',
          task: async (context_): Promise<void> => {
            const config: BlockNodesDeployConfigClass = context_.config;
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  ['app=hedera-json-rpc-relay', `app.kubernetes.io/instance=${config.releaseName}`],
                  constants.RELAY_PODS_READY_MAX_ATTEMPTS,
                  constants.RELAY_PODS_READY_DELAY,
                );
            } catch (error) {
              throw new SoloError(`BlockNodes ${config.releaseName} is not ready: ${error.message}`, error);
            }
          },
        },
        this.addBlockNodesComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error deploying block nodes: ${error.message}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  public getCommandDefinition(): CommandDefinition {
    return {
      command: BlockNodesCommand.COMMAND_NAME,
      desc: 'Manage block nodes in solo network',
      builder: (yargs: AnyYargs) => {
        return yargs
          .command({
            command: 'deploy',
            desc: 'Deploy block nodes',
            builder: (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...BlockNodesCommand.DEPLOY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...BlockNodesCommand.DEPLOY_FLAGS_LIST.optional);
            },
            handler: async (argv: ArgvStruct): Promise<void> => {
              this.logger.info("==== Running 'relay deploy' ===", {argv});
              this.logger.info(argv);

              await this.deploy(argv).then((r): void => {
                this.logger.info('==== Finished running `relay deploy`====');
                if (!r) throw new SoloError('Error deploying relay, expected return value to be true');
              });
            },
          })
          .demandCommand(1, 'Select a relay command');
      },
    };
  }

  /** Adds the relay component to remote config. */
  public addBlockNodesComponent(): SoloListrTask<BlockNodesDeployContext> {
    return {
      title: 'Add relay component in remote config',
      skip: (): boolean => !this.remoteConfigManager.isLoaded(),
      task: async (context_): Promise<void> => {
        await this.remoteConfigManager.modify(async (remoteConfig): Promise<void> => {
          const {
            config: {namespace, nodeAliases},
          } = context_;
          const cluster = this.remoteConfigManager.currentCluster;

          // remoteConfig.components.add(new BlockNodesComponent('relay', cluster, namespace.name, nodeAliases)); // TODO
        });
      },
    };
  }

  public async close(): Promise<void> {} // no-op
}
