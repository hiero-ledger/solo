// SPDX-License-Identifier: Apache-2.0

import {Listr, ListrContext, ListrRendererValue} from 'listr2';
import {SoloError} from '../../core/errors/solo-error.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags, Flags as flags} from '../flags.js';
import {type AnyListrContext, type AnyYargs, type ArgvStruct} from '../../types/aliases.js';
import {type CommandDefinition, type SoloListrTask, SoloListrTaskWrapper} from '../../types/index.js';
import {type CommandFlag, type CommandFlags} from '../../types/flag-types.js';
import {CommandBuilder, CommandGroup, Subcommand} from '../../core/command-path-builders/command-builder.js';
import {inject, injectable} from 'tsyringe-neo';
import {v4 as uuid4} from 'uuid';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {StringEx} from '../../business/utils/string-ex.js';
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
      flags.predefinedAccounts,
      flags.quiet,
      // TODO add flag for consensus node version
    ],
  };

  private static readonly SINGLE_DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [],
  };

  public constructor(@inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager) {
    super();
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
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

              context_.createdAccounts = [];
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
          {
            title: 'Create Accounts',
            skip: () => config.predefinedAccounts === false,
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
              'UNDER CONSTRUCTION: Removes the deployed resources for the selected quick start configuration',
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
