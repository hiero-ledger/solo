// SPDX-License-Identifier: Apache-2.0

import {Listr, ListrContext, ListrRendererValue} from 'listr2';
import {SoloError} from '../../core/errors/solo-error.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags as flags} from '../flags.js';
import {type AnyYargs, type ArgvStruct} from '../../types/aliases.js';
import {type CommandDefinition, SoloListr, type SoloListrTask, SoloListrTaskWrapper} from '../../types/index.js';
import {type CommandFlag, type CommandFlags} from '../../types/flag-types.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {inject, injectable} from 'tsyringe-neo';
import {v4 as uuid4} from 'uuid';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {ArgumentProcessor} from '../../argument-processor.js';
import {QuickStartCommand} from './quick-start.js';
import {QuickStartSingleDeployConfigClass} from './quick-start-single-deploy-config-class.js';
import {QuickStartSingleDeployContext} from './quick-start-single-deploy-context.js';
import {QuickStartSingleDestroyConfigClass} from './quick-start-single-destroy-config-class.js';
import {QuickStartSingleDestroyContext} from './quick-start-single-destroy-context.js';
import {TaskList} from '../../core/task-list/task-list.js';
import {TaskListWrapper} from '../../core/task-list/task-list-wrapper.js';
import * as version from '../../../version.js';
import {ClusterCommandHandlers} from '../cluster/handlers.js';
import {DeploymentCommand} from '../deployment.js';
import {NodeCommandHandlers} from '../node/handlers.js';
import {InitCommand} from '../init/init.js';
import {NetworkCommand} from '../network.js';
import {MirrorNodeCommand} from '../mirror-node.js';
import {ExplorerCommand} from '../explorer.js';
import {RelayCommand} from '../relay.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type AccountManager} from '../../core/account-manager.js';
import {
  CreatedPredefinedAccount,
  PREDEFINED_ACCOUNT_GROUPS,
  PredefinedAccount,
  predefinedEcdsaAccounts,
  predefinedEcdsaAccountsWithAlias,
  predefinedEd25519Accounts,
} from './predefined-accounts.js';
import {AccountId, HbarUnit} from '@hashgraph/sdk';
import * as helpers from '../../core/helpers.js';
import {Duration} from '../../core/time/duration.js';
import {resolveNamespaceFromDeployment} from '../../core/resolvers.js';
import fs from 'node:fs';
import {ArgumentsBuilder} from '../../core/arguments-builder/arguments-builder.js';
import * as nodeFlags from '../node/flags.js';
import * as clusterFlags from '../cluster/flags.js';

@injectable()
export class DefaultQuickStartCommand extends BaseCommand implements QuickStartCommand {
  public static readonly COMMAND_NAME: string = 'quick-start';

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
      flags.predefinedAccounts,
      flags.quiet,
      // TODO add flag for consensus node version
    ],
  };

  public static readonly SINGLE_DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.cacheDir,
      flags.clusterRef,
      flags.context,
      flags.deployment,
      flags.namespace,
      flags.quiet,
      flags.force,
      flags.devMode,
    ],
  };

  public constructor(@inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager) {
    super();
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
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

              context_.createdAccounts = [];
              return;
            },
          },
          this.invokeSoloCommand('solo init', InitCommand.INIT_COMMAND_NAME, () => {
            return ArgumentsBuilder.initialize('init')
              .setCommandFlags(InitCommand.INIT_COMMAND_FLAGS)
              .build(config.cacheDir);
          }),
          this.invokeSoloCommand('solo cluster-ref connect', ClusterCommandHandlers.CONNECT_COMMAND, () => {
            return ArgumentsBuilder.initialize('cluster-ref connect')
              .setCommandFlags(clusterFlags.CONNECT_FLAGS)
              .setArg(flags.clusterRef, config.clusterRef)
              .setArg(flags.context, config.context)
              .build();
          }),
          this.invokeSoloCommand('solo deployment create', DeploymentCommand.CREATE_COMMAND, () => {
            return ArgumentsBuilder.initialize('deployment create')
              .setCommandFlags(DeploymentCommand.CREATE_FLAGS_LIST)
              .setArg(flags.deployment, config.deployment)
              .setArg(flags.namespace, config.namespace.name)
              .build();
          }),
          this.invokeSoloCommand('solo deployment add-cluster', DeploymentCommand.ADD_COMMAND, () => {
            return ArgumentsBuilder.initialize('deployment add-cluster')
              .setCommandFlags(DeploymentCommand.ADD_CLUSTER_FLAGS_LIST)
              .setArg(flags.deployment, config.deployment)
              .setArg(flags.clusterRef, config.clusterRef)
              .setArg(flags.numberOfConsensusNodes, config.numberOfConsensusNodes)
              .build();
          }),
          this.invokeSoloCommand('solo cluster-ref setup', ClusterCommandHandlers.SETUP_COMMAND, () => {
            return ArgumentsBuilder.initialize('cluster-ref setup').setArg(flags.clusterRef, config.clusterRef).build();
          }),
          this.invokeSoloCommand('solo node keys', NodeCommandHandlers.KEYS_COMMAND, () => {
            return ArgumentsBuilder.initialize('node keys')
              .setCommandFlags(nodeFlags.KEYS_FLAGS)
              .setArg(flags.deployment, config.deployment)
              .setArg(flags.generateGossipKeys)
              .setArg(flags.generateTlsKeys)
              .build(config.cacheDir);
          }),
          this.invokeSoloCommand('solo network deploy', NetworkCommand.DEPLOY_COMMAND, () => {
            return ArgumentsBuilder.initialize('network deploy')
              .setCommandFlags(NetworkCommand.DEPLOY_FLAGS_LIST)
              .setArg(flags.deployment, config.deployment)
              .build(config.cacheDir);
          }),
          this.invokeSoloCommand('solo node setup', NodeCommandHandlers.SETUP_COMMAND, () => {
            return ArgumentsBuilder.initialize('node setup')
              .setCommandFlags(nodeFlags.SETUP_FLAGS)
              .setArg(flags.deployment, config.deployment)
              .build(config.cacheDir);
          }),
          this.invokeSoloCommand('solo node start', NodeCommandHandlers.START_COMMAND, () => {
            return ArgumentsBuilder.initialize('node start')
              .setCommandFlags(nodeFlags.START_FLAGS)
              .setArg(flags.deployment, config.deployment)
              .build();
          }),
          this.invokeSoloCommand('solo mirror-node deploy', MirrorNodeCommand.DEPLOY_COMMAND, () => {
            return ArgumentsBuilder.initialize('mirror-node deploy')
              .setCommandFlags(MirrorNodeCommand.DEPLOY_FLAGS_LIST)
              .setArg(flags.deployment, config.deployment)
              .setArg(flags.clusterRef, config.clusterRef)
              .setArg(flags.pinger)
              .setArg(flags.enableIngress)
              .build(config.cacheDir);
          }),
          this.invokeSoloCommand('solo explorer deploy', ExplorerCommand.DEPLOY_COMMAND, () => {
            return ArgumentsBuilder.initialize('explorer deploy')
              .setCommandFlags(ExplorerCommand.DEPLOY_FLAGS_LIST)
              .setArg(flags.deployment, config.deployment)
              .setArg(flags.clusterRef, config.clusterRef)
              .build(config.cacheDir);
          }),
          this.invokeSoloCommand('solo relay deploy', RelayCommand.DEPLOY_COMMAND, () => {
            return ArgumentsBuilder.initialize('relay deploy')
              .setCommandFlags(RelayCommand.DEPLOY_FLAGS_LIST)
              .setArg(flags.deployment, config.deployment)
              .setArg(flags.clusterRef, config.clusterRef)
              .setArg(flags.nodeAliasesUnparsed, 'node1')
              .build();
          }),
          {
            title: 'Create Accounts',
            skip: (): boolean => config.predefinedAccounts === false,
            task: async (
              context_: QuickStartSingleDeployContext,
              task: SoloListrTaskWrapper<QuickStartSingleDeployContext>,
            ): Promise<Listr<QuickStartSingleDeployContext>> => {
              await this.localConfig.load();
              await this.remoteConfig.loadAndValidate(argv);

              const self = this;
              const subTasks: SoloListrTask<QuickStartSingleDeployContext>[] = [];

              const accountsToCreate = [
                ...predefinedEcdsaAccounts,
                ...predefinedEcdsaAccountsWithAlias,
                ...predefinedEd25519Accounts,
              ];

              await self.accountManager.loadNodeClient(
                config.namespace,
                self.remoteConfig.getClusterRefs(),
                context_.config.deployment,
              );

              for (const [index, account] of accountsToCreate.entries()) {
                // inject index to avoid closure issues
                ((index: number, account: PredefinedAccount) => {
                  subTasks.push({
                    title: `Creating Account ${index}`,
                    task: async (
                      context_: QuickStartSingleDeployContext,
                      subTask: SoloListrTaskWrapper<QuickStartSingleDeployContext>,
                    ): Promise<void> => {
                      await helpers.sleep(Duration.ofMillis(100 * index));

                      const createdAccount = await self.accountManager.createNewAccount(
                        context_.config.namespace,
                        account.privateKey,
                        account.balance.to(HbarUnit.Hbar).toNumber(),
                        account.alias,
                        context_.config.context,
                      );

                      context_.createdAccounts.push({
                        accountId: AccountId.fromString(createdAccount.accountId),
                        data: account,
                        alias: createdAccount.accountAlias,
                      });

                      subTask.title = `Account created: ${createdAccount.accountId.toString()}`;
                    },
                  });
                })(index, account);
              }

              // set up the sub-tasks
              return task.newListr(subTasks, {
                concurrent: true,
                rendererOptions: {
                  collapseSubtasks: false,
                },
              });
            },
          },
          {
            title: 'Finish',
            task: async (context_: QuickStartSingleDeployContext): Promise<void> => {
              this.showQuickStartUserNotes(context_);
              this.showVersions();
              this.showPortForwards();
              this.showCreatedAccounts(context_.createdAccounts);

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

  private showCreatedAccounts(createdAccounts: CreatedPredefinedAccount[] = []): void {
    if (createdAccounts.length > 0) {
      createdAccounts.sort((a: CreatedPredefinedAccount, b: CreatedPredefinedAccount): number =>
        a.accountId.compare(b.accountId),
      );

      const ecdsaAccounts: CreatedPredefinedAccount[] = createdAccounts.filter(
        (account: CreatedPredefinedAccount): boolean => account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA,
      );
      const aliasAccounts: CreatedPredefinedAccount[] = createdAccounts.filter(
        (account: CreatedPredefinedAccount): boolean => account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA_ALIAS,
      );
      const ed25519Accounts: CreatedPredefinedAccount[] = createdAccounts.filter(
        (account: CreatedPredefinedAccount): boolean => account.data.group === PREDEFINED_ACCOUNT_GROUPS.ED25519,
      );

      const messageGroupKey: string = 'accounts-created';
      const ecdsaGroupKey: string = 'accounts-created-ecdsa';
      const ecdsaAliasGroupKey: string = 'accounts-created-ecdsa-alias';
      const ed25519GroupKey: string = 'accounts-created-ed25519';
      this.logger.addMessageGroup(messageGroupKey, 'Created Accounts');
      this.logger.addMessageGroup(ecdsaGroupKey, 'ECDSA Accounts:');
      this.logger.addMessageGroup(ecdsaAliasGroupKey, 'ECDSA Alias Accounts:');
      this.logger.addMessageGroup(ed25519GroupKey, 'ED25519 Accounts:');

      this.logger.showMessageGroup(messageGroupKey);

      if (ecdsaAccounts.length > 0) {
        for (const account of ecdsaAccounts) {
          this.logger.addMessageGroupMessage(
            ecdsaGroupKey,
            `Account ID: ${account.accountId.toString()}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
          );
        }

        this.logger.showMessageGroup(ecdsaGroupKey);
      }

      if (aliasAccounts.length > 0) {
        for (const account of aliasAccounts) {
          this.logger.addMessageGroupMessage(
            ecdsaAliasGroupKey,
            `Account ID: ${account.accountId.toString()}, Public address: ${account.alias}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
          );
        }

        this.logger.showMessageGroup(ecdsaAliasGroupKey);
      }

      if (ed25519Accounts.length > 0) {
        for (const account of ed25519Accounts) {
          this.logger.addMessageGroupMessage(
            ed25519GroupKey,
            `Account ID: ${account.accountId.toString()}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
          );
        }

        this.logger.showMessageGroup(ed25519GroupKey);
      }
    }
  }

  private showPortForwards(): void {
    this.logger.showMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP);
  }

  private async destroy(argv: ArgvStruct): Promise<boolean> {
    let config: QuickStartSingleDestroyConfigClass;

    const tasks: SoloListr<QuickStartSingleDestroyContext> = this.taskList.newQuickStartSingleDestroyTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
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

            config = context_.config;

            await this.localConfig.load();

            if (!config.cacheDir) {
              config.cacheDir = constants.SOLO_CACHE_DIR;
            }

            if (!config.clusterRef) {
              config.clusterRef = this.localConfig.configuration.clusterRefs.keys().next().value;
            }

            if (!config.context) {
              config.context = this.localConfig.configuration.clusterRefs.get(config.clusterRef).toString();
            }

            if (!config.deployment) {
              if (this.localConfig.configuration.deployments.length === 0) {
                throw new SoloError('Deployments name is not found in local config');
              }
              config.deployment = this.localConfig.configuration.deployments.get(0).name;
              this.configManager.setFlag(flags.deployment, config.deployment);
            }

            if (!config.namespace) {
              config.namespace = await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
            }
          },
        },
        this.invokeSoloCommand('solo explorer destroy', 'explorer destroy', (): string[] => {
          return ArgumentsBuilder.initialize('explorer destroy')
            .setCommandFlags(ExplorerCommand.DESTROY_FLAGS_LIST)
            .setArg(flags.clusterRef, config.clusterRef)
            .setArg(flags.deployment, config.deployment)
            .setForce()
            .build();
        }),
        this.invokeSoloCommand('solo mirror-node destroy', 'mirror-node destroy', (): string[] => {
          return ArgumentsBuilder.initialize('mirror-node destroy')
            .setCommandFlags(MirrorNodeCommand.DESTROY_FLAGS_LIST)
            .setArg(flags.clusterRef, config.clusterRef)
            .setArg(flags.deployment, config.deployment)
            .setForce()
            .build();
        }),
        this.invokeSoloCommand('solo relay destroy', 'relay destroy', (): string[] => {
          return ArgumentsBuilder.initialize('relay destroy')
            .setCommandFlags(RelayCommand.DESTROY_FLAGS_LIST)
            .setArg(flags.clusterRef, config.clusterRef)
            .setArg(flags.deployment, config.deployment)
            .setArg(flags.nodeAliasesUnparsed, 'node1')
            .build();
        }),
        this.invokeSoloCommand('solo network destroy', 'network destroy', (): string[] => {
          return ArgumentsBuilder.initialize('network destroy')
            .setCommandFlags(NetworkCommand.DESTROY_FLAGS_LIST)
            .setArg(flags.deployment, config.deployment)
            .setArg(flags.deleteSecrets)
            .setArg(flags.deletePvcs)
            .setArg(flags.enableTimeout)
            .setForce()
            .build();
        }),
        this.invokeSoloCommand('solo cluster-ref reset', 'cluster-ref reset', (): string[] => {
          return ArgumentsBuilder.initialize('cluster-ref reset')
            .setCommandFlags(clusterFlags.RESET_FLAGS)
            .setArg(flags.clusterRef, config.clusterRef)
            .setForce()
            .build();
        }),
        {
          title: 'Delete cache folder',
          task: async (): Promise<void> => {
            fs.rmSync(config.cacheDir, {recursive: true, force: true});
          },
        },
        {title: 'Finish', task: async (): Promise<void> => {}},
      ],
      {
        concurrent: false,
        rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      },
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error destroying Solo in quick-start mode: ${error.message}`, error);
    } finally {
      await this.taskList
        .callCloseFunctions()
        .then()
        .catch((error): void => this.logger.error('Error during closing task list:', error));
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
