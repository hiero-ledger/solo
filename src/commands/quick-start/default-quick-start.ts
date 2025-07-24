// SPDX-License-Identifier: Apache-2.0

import {Listr, ListrContext, ListrRendererValue} from 'listr2';
import {SoloError} from '../../core/errors/solo-error.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags, Flags as flags} from '../flags.js';
import {type AnyListrContext, type ArgvStruct} from '../../types/aliases.js';
import {SoloListrTaskWrapper} from '../../types/index.js';
import {type CommandFlag, type CommandFlags} from '../../types/flag-types.js';
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
import {InitCommand} from '../init/init.js';
import {TaskList} from '../../core/task-list/task-list.js';
import {TaskListWrapper} from '../../core/task-list/task-list-wrapper.js';
import * as version from '../../../version.js';
import {ClusterReferenceCommandDefinition} from '../command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../command-definitions/deployment-command-definition.js';
import {ConsensusCommandDefinition} from '../command-definitions/consensus-command-definition.js';
import {KeysCommandDefinition} from '../command-definitions/keys-command-definition.js';
import {MirrorCommandDefinition} from '../command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from '../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../command-definitions/relay-command-definition.js';

@injectable()
export class DefaultQuickStartCommand extends BaseCommand implements QuickStartCommand {
  private static readonly SINGLE_ADD_CONFIGS_NAME: string = 'singleAddConfigs';

  private static readonly SINGLE_DESTROY_CONFIGS_NAME: string = 'singleDestroyConfigs';

  public static readonly SINGLE_ADD_FLAGS_LIST: CommandFlags = {
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

  public static readonly SINGLE_DESTROY_FLAGS_LIST: CommandFlags = {
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

  public async deploy(argv: ArgvStruct): Promise<boolean> {
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
          this.invokeSoloCommand(
            `solo ${InitCommand.INIT_COMMAND_NAME}`,
            InitCommand.INIT_COMMAND_NAME,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(InitCommand.COMMAND_NAME);
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand(
            `solo ${ClusterReferenceCommandDefinition.CONNECT_COMMAND}`,
            ClusterReferenceCommandDefinition.CONNECT_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ClusterReferenceCommandDefinition.COMMAND_NAME,
                ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME,
                ClusterReferenceCommandDefinition.CONFIG_CONNECT,
                this.optionFromFlag(Flags.clusterRef),
                config.clusterRef,
                this.optionFromFlag(Flags.context),
                config.context,
              );
              return this.argvPushGlobalFlags(argv);
            },
          ),
          this.invokeSoloCommand(
            `solo ${DeploymentCommandDefinition.CREATE_COMMAND}`,
            DeploymentCommandDefinition.CREATE_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                DeploymentCommandDefinition.COMMAND_NAME,
                DeploymentCommandDefinition.CONFIG_SUBCOMMAND_NAME,
                DeploymentCommandDefinition.CONFIG_CREATE,
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.namespace),
                config.namespace.name,
              );
              return this.argvPushGlobalFlags(argv);
            },
          ),
          this.invokeSoloCommand(
            `solo ${DeploymentCommandDefinition.ADD_COMMAND}`,
            DeploymentCommandDefinition.ADD_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                DeploymentCommandDefinition.COMMAND_NAME,
                DeploymentCommandDefinition.CLUSTER_SUBCOMMAND_NAME,
                DeploymentCommandDefinition.CLUSTER_ATTACH,
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                config.clusterRef,
                this.optionFromFlag(Flags.numberOfConsensusNodes),
                config.numberOfConsensusNodes.toString(),
              );
              return this.argvPushGlobalFlags(argv);
            },
          ),
          this.invokeSoloCommand(
            `solo ${ClusterReferenceCommandDefinition.SETUP_COMMAND}`,
            ClusterReferenceCommandDefinition.SETUP_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ClusterReferenceCommandDefinition.COMMAND_NAME,
                ClusterReferenceCommandDefinition.CONFIG_SUBCOMMAND_NAME,
                ClusterReferenceCommandDefinition.CONFIG_SETUP,
                this.optionFromFlag(Flags.clusterRef),
                config.clusterRef,
              );
              return this.argvPushGlobalFlags(argv);
            },
          ),
          this.invokeSoloCommand(
            `solo ${KeysCommandDefinition.KEYS_COMMAND}`,
            KeysCommandDefinition.KEYS_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                KeysCommandDefinition.COMMAND_NAME,
                KeysCommandDefinition.CONSENSUS_SUBCOMMAND_NAME,
                KeysCommandDefinition.CONSENSUS_GENERATE,
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.generateGossipKeys),
                'true',
                this.optionFromFlag(Flags.generateTlsKeys),
              );
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand(
            `solo ${ConsensusCommandDefinition.DEPLOY_COMMAND}`,
            ConsensusCommandDefinition.DEPLOY_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ConsensusCommandDefinition.COMMAND_NAME,
                ConsensusCommandDefinition.NETWORK_SUBCOMMAND_NAME,
                ConsensusCommandDefinition.NETWORK_DEPLOY,
                this.optionFromFlag(Flags.deployment),
                config.deployment,
              );
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand(
            `solo ${ConsensusCommandDefinition.SETUP_COMMAND}`,
            ConsensusCommandDefinition.SETUP_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ConsensusCommandDefinition.COMMAND_NAME,
                ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
                ConsensusCommandDefinition.NODE_SETUP,
                this.optionFromFlag(Flags.deployment),
                config.deployment,
              );
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand(
            `solo ${ConsensusCommandDefinition.START_COMMAND}`,
            ConsensusCommandDefinition.START_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ConsensusCommandDefinition.COMMAND_NAME,
                ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
                ConsensusCommandDefinition.NODE_START,
                this.optionFromFlag(Flags.deployment),
                config.deployment,
              );
              return this.argvPushGlobalFlags(argv);
            },
          ),
          this.invokeSoloCommand(
            `solo ${MirrorCommandDefinition.DEPLOY_COMMAND}`,
            MirrorCommandDefinition.DEPLOY_COMMAND,

            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                MirrorCommandDefinition.COMMAND_NAME,
                MirrorCommandDefinition.NODE_SUBCOMMAND_NAME,
                MirrorCommandDefinition.NODE_ADD,
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
          this.invokeSoloCommand(
            `solo ${ExplorerCommandDefinition.DEPLOY_COMMAND}`,
            ExplorerCommandDefinition.DEPLOY_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ExplorerCommandDefinition.COMMAND_NAME,
                ExplorerCommandDefinition.NODE_SUBCOMMAND_NAME,
                ExplorerCommandDefinition.NODE_ADD,
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                config.clusterRef,
              );
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand(
            `solo ${RelayCommandDefinition.DEPLOY_COMMAND}`,
            RelayCommandDefinition.DEPLOY_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                RelayCommandDefinition.COMMAND_NAME,
                RelayCommandDefinition.NODE_SUBCOMMAND_NAME,
                RelayCommandDefinition.NODE_ADD,
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                config.clusterRef,
                this.optionFromFlag(Flags.nodeAliasesUnparsed),
                'node1',
              );
              return this.argvPushGlobalFlags(argv);
            },
          ),
          {
            title: 'Finish',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              this.showQuickStartUserNotes(context_);
              this.showVersions();
              this.showPortForwards();

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
      await this.taskList
        .callCloseFunctions()
        .then()
        .catch((error): void => {
          this.logger.error('Error during closing task list:', error);
        });
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

  private showPortForwards(): void {
    this.logger.showMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP);
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
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

  public async close(): Promise<void> {} // no-op
}
