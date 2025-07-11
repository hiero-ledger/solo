// SPDX-License-Identifier: Apache-2.0

import {Listr, ListrContext, ListrRendererValue} from 'listr2';
import {SoloError} from '../../core/errors/solo-error.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags, Flags as flags} from '../flags.js';
import {type AnyListrContext, type AnyYargs, type ArgvStruct} from '../../types/aliases.js';
import {type CommandDefinition, SoloListrTaskWrapper} from '../../types/index.js';
import {type CommandFlag, type CommandFlags} from '../../types/flag-types.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {injectable} from 'tsyringe-neo';
import {v4 as uuid4} from 'uuid';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {StringEx} from '../../business/utils/string-ex.js';
import {ArgumentProcessor} from '../../argument-processor.js';
import {QuickStartCommand} from './quick-start.js';
import {QuickStartSingleDeployConfigClass} from './quick-start-single-deploy-config-class.js';
import {QuickStartSingleDeployContext} from './quick-start-single-deploy-context.js';
import {QuickStartSingleDestroyConfigClass} from './quick-start-single-destroy-config-class.js';
import {QuickStartSingleDestroyContext} from './quick-start-single-destroy-context.js';
import {ClusterCommandHandlers} from '../cluster/handlers.js';
import {DeploymentCommand} from '../deployment.js';
import {NodeCommandHandlers} from '../node/handlers.js';
import {InitCommand} from '../init/init.js';
import {NetworkCommand} from '../network.js';
import {MirrorNodeCommand} from '../mirror-node.js';
import {ExplorerCommand} from '../explorer.js';
import {RelayCommand} from '../relay.js';
import {TaskList} from '../../core/task-list/task-list.js';
import {TaskListWrapper} from '../../core/task-list/task-list-wrapper.js';
import * as version from '../../../version.js';

@injectable()
export class DefaultQuickStartCommand extends BaseCommand implements QuickStartCommand {
  public static readonly COMMAND_NAME: string = 'quick-start';

  private static readonly SINGLE_ADD_CONFIGS_NAME: string = 'singleAddConfigs';

  private static readonly SINGLE_DESTROY_CONFIGS_NAME: string = 'singleDestroyConfigs';

  private static readonly SINGLE_ADD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.cacheDir,
      flags.clusterRef,
      flags.clusterSetupNamespace,
      flags.context,
      flags.deployment,
      flags.devMode,
      flags.namespace,
      flags.numberOfConsensusNodes,
      flags.quiet,
      // TODO add flag for consensus node version
    ],
  };

  private static readonly SINGLE_DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [],
  };

  public constructor() {
    super();
  }

  private newArgv(): string[] {
    return ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
  }

  private optionFromFlag(flag: CommandFlag): string {
    return `--${flag.name}`;
  }

  private argvPushGlobalFlags(argv: string[], cacheDirectory: string = StringEx.EMPTY): string[] {
    argv.push(this.optionFromFlag(Flags.devMode), this.optionFromFlag(Flags.quiet));
    if (cacheDirectory) {
      argv.push(this.optionFromFlag(Flags.cacheDir), cacheDirectory);
    }
    return argv;
  }

  private invokeSoloCommand(title: string, commandName: string, callback: () => string[]) {
    return {
      title,
      task: async (_, taskListWrapper) => {
        return this.subTaskSoloCommand(commandName, this.taskList, taskListWrapper, callback);
      },
    };
  }

  private async subTaskSoloCommand(
    commandName: string,
    taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    taskListWrapper: TaskListWrapper,
    callback: () => string[],
  ): Promise<Listr<ListrContext, any, any> | Listr<ListrContext, any, any>[]> {
    taskList.parentTaskListMap.set(commandName, {taskListWrapper});
    const newArgv: string[] = callback();
    await ArgumentProcessor.process(newArgv);
    return this.taskList.parentTaskListMap.get(commandName).children;
  }

  private async deploy(argv: ArgvStruct): Promise<boolean> {
    let config: QuickStartSingleDeployConfigClass | null = null;

    const tasks: Listr<QuickStartSingleDeployContext, ListrRendererValue, ListrRendererValue> =
      this.taskList.newQuickStartSingleDeployTaskList(
        [
          {
            title: 'Initialize',
            task: async (
              context_: QuickStartSingleDeployContext,
              task: SoloListrTaskWrapper<QuickStartSingleDeployContext>,
            ): Promise<void> => {
              this.configManager.update(argv);

              flags.disablePrompts(DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.optional);

              const allFlags: CommandFlag[] = [
                ...DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.required,
                ...DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.optional,
              ];

              await this.configManager.executePrompt(task, allFlags);

              context_.config = this.configManager.getConfig(
                DefaultQuickStartCommand.SINGLE_ADD_CONFIGS_NAME,
                allFlags,
              ) as QuickStartSingleDeployConfigClass;
              config = context_.config;

              const uniquePostfix: string = uuid4().slice(-8);

              context_.config.clusterRef = context_.config.clusterRef || `solo-${uniquePostfix}`;
              context_.config.context = context_.config.context || this.k8Factory.default().contexts().readCurrent();
              context_.config.deployment = context_.config.deployment || `solo-deployment-${uniquePostfix}`;
              context_.config.namespace = context_.config.namespace || NamespaceName.of(`solo-${uniquePostfix}`);
              context_.config.numberOfConsensusNodes = context_.config.numberOfConsensusNodes || 1;
              return;
            },
          },
          this.invokeSoloCommand('solo init', InitCommand.INIT_COMMAND_NAME, () => {
            const argv: string[] = this.newArgv();
            argv.push('init');
            return this.argvPushGlobalFlags(argv, config.cacheDir);
          }),
          this.invokeSoloCommand('solo cluster-ref connect', ClusterCommandHandlers.CONNECT_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push(
              'cluster-ref',
              'connect',
              this.optionFromFlag(Flags.clusterRef),
              config.clusterRef,
              this.optionFromFlag(Flags.context),
              config.context,
            );
            return this.argvPushGlobalFlags(argv);
          }),
          this.invokeSoloCommand('solo deployment create', DeploymentCommand.CREATE_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push(
              'deployment',
              'create',
              this.optionFromFlag(Flags.deployment),
              config.deployment,
              this.optionFromFlag(Flags.namespace),
              config.namespace.name,
            );
            return this.argvPushGlobalFlags(argv);
          }),
          this.invokeSoloCommand('solo deployment add-cluster', DeploymentCommand.ADD_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push(
              'deployment',
              'add-cluster',
              this.optionFromFlag(Flags.deployment),
              config.deployment,
              this.optionFromFlag(Flags.clusterRef),
              config.clusterRef,
              this.optionFromFlag(Flags.numberOfConsensusNodes),
              config.numberOfConsensusNodes.toString(),
            );
            return this.argvPushGlobalFlags(argv);
          }),
          this.invokeSoloCommand('solo cluster-ref setup', ClusterCommandHandlers.SETUP_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push('cluster-ref', 'setup', this.optionFromFlag(Flags.clusterRef), config.clusterRef);
            return this.argvPushGlobalFlags(argv);
          }),
          this.invokeSoloCommand('solo node keys', NodeCommandHandlers.KEYS_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push(
              'node',
              'keys',
              this.optionFromFlag(Flags.deployment),
              config.deployment,
              this.optionFromFlag(Flags.generateGossipKeys),
              'true',
              this.optionFromFlag(Flags.generateTlsKeys),
            );
            return this.argvPushGlobalFlags(argv, config.cacheDir);
          }),
          this.invokeSoloCommand('solo network deploy', NetworkCommand.DEPLOY_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push('network', 'deploy', this.optionFromFlag(Flags.deployment), config.deployment);
            return this.argvPushGlobalFlags(argv, config.cacheDir);
          }),
          this.invokeSoloCommand('solo node setup', NodeCommandHandlers.SETUP_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push('node', 'setup', this.optionFromFlag(Flags.deployment), config.deployment);
            return this.argvPushGlobalFlags(argv, config.cacheDir);
          }),
          this.invokeSoloCommand('solo node start', NodeCommandHandlers.START_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push('node', 'start', this.optionFromFlag(Flags.deployment), config.deployment);
            return this.argvPushGlobalFlags(argv);
          }),
          this.invokeSoloCommand(
            'solo mirror-node deploy',
            MirrorNodeCommand.DEPLOY_COMMAND,

            () => {
              const argv: string[] = this.newArgv();
              argv.push(
                'mirror-node',
                'deploy',
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                config.clusterRef,
                this.optionFromFlag(Flags.pinger),
                this.optionFromFlag(Flags.enableIngress),
              );
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand('solo explorer deploy', ExplorerCommand.DEPLOY_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push(
              'explorer',
              'deploy',
              this.optionFromFlag(Flags.deployment),
              config.deployment,
              this.optionFromFlag(Flags.clusterRef),
              config.clusterRef,
            );
            return this.argvPushGlobalFlags(argv, config.cacheDir);
          }),
          this.invokeSoloCommand('solo relay deploy', RelayCommand.DEPLOY_COMMAND, () => {
            const argv: string[] = this.newArgv();
            argv.push(
              'relay',
              'deploy',
              this.optionFromFlag(Flags.deployment),
              config.deployment,
              this.optionFromFlag(Flags.clusterRef),
              config.clusterRef,
              this.optionFromFlag(Flags.nodeAliasesUnparsed),
              'node1',
            );
            return this.argvPushGlobalFlags(argv);
          }),
          // TODO expose port forward endpoints and dump the URLs to the user output
          {
            title: 'Finish',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              this.showQuickStartUserNotes(context_);
              this.showVersions();

              return;
            },
          },
        ],
        {
          concurrent: false,
          rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
        },
      );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error deploying Solo in quick-start mode: ${error.message}`, error);
    } finally {
      await this.taskList.callCloseFunctions();
    }

    return true;
  }

  private showQuickStartUserNotes(context_: QuickStartSingleDeployContext): void {
    const messageGroupKey: string = 'quick-start-user-notes';
    this.logger.addMessageGroup(messageGroupKey, 'Quick Start User Notes');
    this.logger.addMessageGroupMessage(messageGroupKey, `Cluster Reference: ${context_.config.clusterRef}`);
    this.logger.addMessageGroupMessage(messageGroupKey, `Deployment Name: ${context_.config.deployment}`);
    this.logger.addMessageGroupMessage(messageGroupKey, `Namespace Name: ${context_.config.namespace.name}`);
    this.logger.addMessageGroupMessage(
      messageGroupKey,
      'To quickly delete the deployed resources, run the following command:\n' +
        `kubectl delete ns ${context_.config.namespace.name}`,
    );

    this.logger.addMessageGroupMessage(
      messageGroupKey,
      'To access the deployed services, use the following commands:\n' +
        `kubectl port-forward svc/haproxy-node1-svc -n ${context_.config.namespace.name} 50211:50211 > /dev/null 2>&1 &\n` +
        `kubectl port-forward svc/hiero-explorer -n ${context_.config.namespace.name} 8080:80 > /dev/null 2>&1 &\n` +
        `kubectl port-forward svc/mirror-grpc -n ${context_.config.namespace.name} 5600:5600 > /dev/null 2>&1 &\n` +
        `kubectl port-forward svc/mirror-rest -n ${context_.config.namespace.name} 5551:80 > /dev/null 2>&1 &\n` +
        `kubectl port-forward service/mirror-restjava -n ${context_.config.namespace.name} 8084:80 > /dev/null 2>&1 &\n` +
        `kubectl port-forward svc/relay-node1-hedera-json-rpc-relay -n ${context_.config.namespace.name} 7546:7546 > /dev/null 2>&1 &\n`,
    );

    this.logger.showMessageGroup(messageGroupKey);
  }

  private showVersions(): void {
    const messageGroupKey: string = 'versions-used';
    this.logger.addMessageGroup(messageGroupKey, 'Versions Used');

    this.logger.addMessageGroupMessage(messageGroupKey, `Solo Chart Version: ${version.SOLO_CHART_VERSION}`);
    this.logger.addMessageGroupMessage(messageGroupKey, `Consensus Node Version: ${version.HEDERA_PLATFORM_VERSION}`);
    this.logger.addMessageGroupMessage(messageGroupKey, `Mirror Node Version: ${version.MIRROR_NODE_VERSION}`);
    this.logger.addMessageGroupMessage(messageGroupKey, `Explorer Version: ${version.EXPLORER_VERSION}`);
    this.logger.addMessageGroupMessage(
      messageGroupKey,
      `JSON RPC Relay Version: ${version.HEDERA_JSON_RPC_RELAY_VERSION}`,
    );

    this.logger.showMessageGroup(messageGroupKey);
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    const tasks: Listr<QuickStartSingleDestroyContext> = new Listr<QuickStartSingleDestroyContext>([
      {
        title: 'Initialize',
        task: async (context_, task): Promise<Listr<AnyListrContext>> => {
          this.configManager.update(argv);

          flags.disablePrompts(DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.optional);

          const allFlags: CommandFlag[] = [
            ...DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.required,
            ...DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.optional,
          ];

          await this.configManager.executePrompt(task, allFlags);

          context_.config = this.configManager.getConfig(
            DefaultQuickStartCommand.SINGLE_DESTROY_CONFIGS_NAME,
            allFlags,
          ) as QuickStartSingleDestroyConfigClass;

          return null;
        },
      },
      // TODO implement destroy tasks
    ]);

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error destroying Solo in quick-start mode: ${error.message}`, error);
    }

    return true;
  }

  public getCommandDefinition(): CommandDefinition {
    return new CommandBuilder(DefaultQuickStartCommand.COMMAND_NAME, 'Manage quick start for solo network', this.logger)
      .addCommandGroup(
        new CommandGroup('single', 'A single consensus node quick start configuration')
          .addSubcommand(
            new Subcommand(
              'deploy',
              'Deploys all required components for the selected quick start configuration',
              this,
              this.deploy,
              (y: AnyYargs): void => {
                flags.setRequiredCommandFlags(y, ...DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.required);
                flags.setOptionalCommandFlags(y, ...DefaultQuickStartCommand.SINGLE_ADD_FLAGS_LIST.optional);
              },
            ),
          )
          .addSubcommand(
            new Subcommand(
              'destroy',
              'Removes the deployed resources for the selected quick start configuration',
              this,
              this.destroy,
              (y: AnyYargs): void => {
                flags.setRequiredCommandFlags(y, ...DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.required);
                flags.setOptionalCommandFlags(y, ...DefaultQuickStartCommand.SINGLE_DESTROY_FLAGS_LIST.optional);
              },
            ),
          ),
      )
      .build();
  }

  public async close(): Promise<void> {} // no-op
}
