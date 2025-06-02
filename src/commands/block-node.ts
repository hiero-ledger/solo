// SPDX-License-Identifier: Apache-2.0

import {Listr} from 'listr2';
import {SoloError} from '../core/errors/solo-error.js';
import * as helpers from '../core/helpers.js';
import {showVersionBanner, sleep} from '../core/helpers.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {resolveNamespaceFromDeployment} from '../core/resolvers.js';
import {
  type AnyListrContext,
  type AnyYargs,
  type ArgvStruct,
  type NodeAlias,
  type NodeAliases,
} from '../types/aliases.js';
import {ListrLock} from '../core/lock/listr-lock.js';
import {
  type ClusterReference,
  type CommandDefinition,
  type DeploymentName,
  type Optional,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../types/index.js';
import * as versions from '../../version.js';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {type Lock} from '../core/lock/lock.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {ContainerReference} from '../integration/kube/resources/container/container-reference.js';
import {Duration} from '../core/time/duration.js';
import {type PodReference} from '../integration/kube/resources/pod/pod-reference.js';
import chalk from 'chalk';
import {CommandBuilder, CommandGroup, Subcommand} from '../core/command-path-builders/command-builder.js';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {ComponentStateMetadataSchema} from '../data/schema/model/remote/state/component-state-metadata-schema.js';
import {DeploymentPhase} from '../data/schema/model/remote/deployment-phase.js';
import {ComponentTypes} from '../core/config/remote/enumerations/component-types.js';
import {lt, SemVer} from 'semver';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {BlockNodeConfigRuntimeState} from '../business/runtime-state/config/block-node/block-node-config-runtime-state.js';

interface BlockNodeDeployConfigClass {
  chartVersion: string;
  chartDirectory: string;
  clusterRef: ClusterReference;
  deployment: DeploymentName;
  devMode: boolean;
  domainName: Optional<string>;
  enableIngress: boolean;
  quiet: boolean;
  valuesFile: Optional<string>;
  releaseTag: string;
  namespace: NamespaceName;
  nodeAliases: NodeAliases; // from remote config
  context: string;
  valuesArg: string;
  newBlockNodeComponent: BlockNodeStateSchema;
  releaseName: string;
}

interface BlockNodeDeployContext {
  config: BlockNodeDeployConfigClass;
}

interface BlockNodeDestroyConfigClass {
  chartDirectory: string;
  clusterRef: ClusterReference;
  deployment: DeploymentName;
  devMode: boolean;
  quiet: boolean;
  namespace: NamespaceName;
  context: string;
  isChartInstalled: boolean;
  valuesArg: string;
  releaseName: string;
}

interface BlockNodeDestroyContext {
  config: BlockNodeDestroyConfigClass;
}

@injectable()
export class BlockNodeCommand extends BaseCommand {
  public static readonly COMMAND_NAME: string = 'block';

  private static readonly ADD_CONFIGS_NAME: string = 'addConfigs';

  private static readonly DESTROY_CONFIGS_NAME: string = 'destroyConfigs';

  private static readonly ADD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.blockNodeChartVersion,
      flags.clusterRef,
      flags.deployment,
      flags.devMode,
      flags.domainName,
      flags.enableIngress,
      flags.quiet,
      flags.valuesFile,
      flags.releaseTag,
    ],
  };

  private static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.chartDirectory, flags.clusterRef, flags.deployment, flags.devMode, flags.force, flags.quiet],
  };

  public constructor(
    @inject(InjectTokens.BlockNodeConfigRuntimeState) private readonly blockNodeConfig: BlockNodeConfigRuntimeState,
  ) {
    super();

    this.blockNodeConfig = patchInject(
      blockNodeConfig,
      InjectTokens.BlockNodeConfigRuntimeState,
      BlockNodeCommand.name,
    );
  }

  private async prepareValuesArgForBlockNode(config: BlockNodeDeployConfigClass): Promise<string> {
    let valuesArgument: string = '';

    valuesArgument += helpers.prepareValuesFiles(constants.BLOCK_NODE_VALUES_FILE);

    if (config.valuesFile) {
      valuesArgument += helpers.prepareValuesFiles(config.valuesFile);
    }

    valuesArgument += helpers.populateHelmArguments({nameOverride: config.releaseName});

    if (config.domainName) {
      valuesArgument += helpers.populateHelmArguments({
        'ingress.enabled': true,
        'ingress.hosts[0].host': config.domainName,
        'ingress.hosts[0].paths[0].path': '/',
        'ingress.hosts[0].paths[0].pathType': 'ImplementationSpecific',
      });
    }

    return valuesArgument;
  }

  private getReleaseName(): string {
    return (
      constants.BLOCK_NODE_RELEASE_NAME +
      '-' +
      this.remoteConfig.configuration.components.getNewComponentId(ComponentTypes.BlockNode)
    );
  }

  private async add(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<BlockNodeDeployContext> = new Listr<BlockNodeDeployContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            this.configManager.update(argv);

            flags.disablePrompts(BlockNodeCommand.ADD_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodeCommand.ADD_FLAGS_LIST.required,
              ...BlockNodeCommand.ADD_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(BlockNodeCommand.ADD_CONFIGS_NAME, allFlags, [
              'chartDirectory',
            ]) as BlockNodeDeployConfigClass;

            const platformVersion: SemVer = new SemVer(context_.config.releaseTag);
            if (lt(platformVersion, new SemVer('v0.62.0'))) {
              throw new SoloError('Hedera platform versions less than v0.62.0 are not supported');
            }

            context_.config.chartDirectory = this.blockNodeConfig.blockNodeConfig.helmChart.directory;
            context_.config.namespace = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );

            context_.config.nodeAliases = this.remoteConfig.getConsensusNodes().map((node): NodeAlias => node.name);

            if (!context_.config.clusterRef) {
              context_.config.clusterRef = this.k8Factory.default().clusters().readCurrent();
            }

            context_.config.context = this.remoteConfig.getClusterRefs()[context_.config.clusterRef];

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Prepare release name and block node name',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            config.releaseName = this.getReleaseName();

            config.newBlockNodeComponent = new BlockNodeStateSchema(
              new ComponentStateMetadataSchema(1, config.namespace.name, config.clusterRef, DeploymentPhase.DEPLOYED),
            );
          },
        },
        {
          title: 'Prepare chart values',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            config.valuesArg = await this.prepareValuesArgForBlockNode(config);
          },
        },
        {
          title: 'Deploy block node',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            await this.chartManager.install(
              config.namespace,
              config.releaseName,
              constants.BLOCK_NODE_CHART,
              constants.BLOCK_NODE_CHART_URL,
              config.chartVersion,
              config.valuesArg,
              config.context,
            );

            showVersionBanner(this.logger, config.releaseName, versions.BLOCK_NODE_VERSION);
          },
        },
        {
          title: 'Check block node pod is running',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            await this.k8Factory
              .getK8(config.context)
              .pods()
              .waitForRunningPhase(
                config.namespace,
                [`app.kubernetes.io/instance=${config.releaseName}`],
                constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS,
                constants.BLOCK_NODE_PODS_RUNNING_DELAY,
              );
          },
        },
        {
          title: 'Check software',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;

            const labels: string[] = [`app.kubernetes.io/instance=${config.releaseName}`];

            const blockNodePods: Pod[] = await this.k8Factory
              .getK8(config.context)
              .pods()
              .list(config.namespace, labels);

            if (blockNodePods.length === 0) {
              throw new SoloError('Failed to list block node pod');
            }
          },
        },
        {
          title: 'Check block node pod is ready',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDeployConfigClass = context_.config;
            try {
              await this.k8Factory
                .getK8(config.context)
                .pods()
                .waitForReadyStatus(
                  config.namespace,
                  [`app.kubernetes.io/instance=${config.releaseName}`],
                  constants.BLOCK_NODE_PODS_RUNNING_MAX_ATTEMPTS,
                  constants.BLOCK_NODE_PODS_RUNNING_DELAY,
                );
            } catch (error) {
              throw new SoloError(`Block node ${config.releaseName} is not ready: ${error.message}`, error);
            }
          },
        },
        this.checkBlockNodeReadiness(),
        this.addBlockNodeComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error deploying block node: ${error.message}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const lease: Lock = await this.leaseManager.create();

    const tasks: Listr<BlockNodeDestroyContext> = new Listr<BlockNodeDestroyContext>(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<Listr<AnyListrContext>> => {
            this.configManager.update(argv);

            flags.disablePrompts(BlockNodeCommand.DESTROY_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...BlockNodeCommand.DESTROY_FLAGS_LIST.required,
              ...BlockNodeCommand.DESTROY_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              BlockNodeCommand.DESTROY_CONFIGS_NAME,
              allFlags,
            ) as BlockNodeDestroyConfigClass;

            context_.config.namespace = await resolveNamespaceFromDeployment(
              this.localConfig,
              this.configManager,
              task,
            );

            if (!context_.config.clusterRef) {
              context_.config.clusterRef = this.k8Factory.default().clusters().readCurrent();
            }

            context_.config.context = this.remoteConfig.getClusterRefs()[context_.config.clusterRef];

            context_.config.releaseName = this.getReleaseName();

            context_.config.isChartInstalled = await this.chartManager.isChartInstalled(
              context_.config.namespace,
              context_.config.releaseName,
              context_.config.context,
            );

            this.logger.debug('Initialized config', {config: context_.config});

            return ListrLock.newAcquireLockTask(lease, task);
          },
        },
        {
          title: 'Look-up block node',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDestroyConfigClass = context_.config;
            try {
              // TODO: Add support for multiple block nodes
              this.remoteConfig.configuration.components.getComponent<BlockNodeStateSchema>(
                ComponentTypes.BlockNode,
                1,
              );
            } catch (error) {
              throw new SoloError(`Block node ${config.releaseName} was not found`, error);
            }
          },
        },
        {
          title: 'Destroy block node',
          task: async (context_): Promise<void> => {
            const config: BlockNodeDestroyConfigClass = context_.config;

            await this.chartManager.uninstall(config.namespace, config.releaseName, config.context);
          },
          skip: (context_): boolean => !context_.config.isChartInstalled,
        },
        this.removeBlockNodeComponent(),
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error deploying block node: ${error.message}`, error);
    } finally {
      await lease.release();
    }

    return true;
  }

  /** Adds the block node component to remote config. */
  private addBlockNodeComponent(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Add block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_): Promise<void> => {
        const config: BlockNodeDeployConfigClass = context_.config;

        this.remoteConfig.configuration.components.addNewComponent(
          config.newBlockNodeComponent,
          ComponentTypes.BlockNode,
        );

        await this.remoteConfig.persist();
      },
    };
  }

  /** Adds the block node component to remote config. */
  private removeBlockNodeComponent(): SoloListrTask<BlockNodeDestroyContext> {
    return {
      title: 'Disable block node component in remote config',
      skip: (): boolean => !this.remoteConfig.isLoaded(),
      task: async (context_): Promise<void> => {
        const config: BlockNodeDestroyConfigClass = context_.config;

        // TODO: Add support for multiple block nodes
        this.remoteConfig.configuration.components.removeComponent(1, ComponentTypes.BlockNode);

        await this.remoteConfig.persist();
      },
    };
  }

  private displayHealthCheckData(
    task: SoloListrTaskWrapper<BlockNodeDeployContext>,
  ): (attempt: number, maxAttempt: number, color?: 'yellow' | 'green' | 'red', additionalData?: string) => void {
    const baseTitle: string = task.title;

    return function (
      attempt: number,
      maxAttempt: number,
      color: 'yellow' | 'green' | 'red' = 'yellow',
      additionalData: string = '',
    ): void {
      task.title = `${baseTitle} - ${chalk[color](`[${attempt}/${maxAttempt}]`)} ${chalk[color](additionalData)}`;
    };
  }

  private checkBlockNodeReadiness(): SoloListrTask<BlockNodeDeployContext> {
    return {
      title: 'Check block node readiness',
      task: async (context_, task): Promise<void> => {
        const config: BlockNodeDeployConfigClass = context_.config;

        const displayHealthcheckCallback: (
          attempt: number,
          maxAttempt: number,
          color?: 'yellow' | 'green' | 'red',
          additionalData?: string,
        ) => void = this.displayHealthCheckData(task);

        const blockNodePodReference: PodReference = await this.k8Factory
          .getK8(config.context)
          .pods()
          .list(config.namespace, [`app.kubernetes.io/instance=${config.releaseName}`])
          .then((pods: Pod[]): PodReference => pods[0].podReference);

        const containerReference: ContainerReference = ContainerReference.of(
          blockNodePodReference,
          constants.BLOCK_NODE_CONTAINER_NAME,
        );

        const maxAttempts: number = constants.BLOCK_NODE_ACTIVE_MAX_ATTEMPTS;
        let attempt: number = 1;
        let success: boolean = false;

        displayHealthcheckCallback(attempt, maxAttempts);

        while (attempt < maxAttempts) {
          try {
            const response: string = await helpers.withTimeout(
              this.k8Factory
                .getK8(config.context)
                .containers()
                .readByRef(containerReference)
                .execContainer(['bash', '-c', 'curl -s http://localhost:8080/healthz/readyz']),
              Duration.ofMillis(constants.BLOCK_NODE_ACTIVE_TIMEOUT),
              'Healthcheck timed out',
            );

            if (response !== 'OK') {
              throw new SoloError('Bad response status');
            }

            success = true;
            break;
          } catch {
            // Guard
          }

          attempt++;
          await sleep(Duration.ofSeconds(constants.BLOCK_NODE_ACTIVE_DELAY));
          displayHealthcheckCallback(attempt, maxAttempts);
        }

        if (!success) {
          displayHealthcheckCallback(attempt, maxAttempts, 'red', 'max attempts reached');
          throw new SoloError('Max attempts reached');
        }

        displayHealthcheckCallback(attempt, maxAttempts, 'green', 'success');
      },
    };
  }

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(
      BlockNodeCommand.COMMAND_NAME,
      'Manage block related components in solo network',
      this.logger,
    )
      .addCommandGroup(
        new CommandGroup('node', 'Manage block nodes in solo network')
          .addSubcommand(
            new Subcommand('add', 'Add block node', this, this.add, (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...BlockNodeCommand.ADD_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...BlockNodeCommand.ADD_FLAGS_LIST.optional);
            }),
          )
          .addSubcommand(
            new Subcommand('destroy', 'destroy block node', this, this.destroy, (y: AnyYargs): void => {
              flags.setRequiredCommandFlags(y, ...BlockNodeCommand.DESTROY_FLAGS_LIST.required);
              flags.setOptionalCommandFlags(y, ...BlockNodeCommand.DESTROY_FLAGS_LIST.optional);
            }),
          ),
      )
      .build();
  }

  public async close(): Promise<void> {} // no-op
}
