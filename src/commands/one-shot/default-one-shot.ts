// SPDX-License-Identifier: Apache-2.0

import {Listr, ListrContext, ListrRendererValue} from 'listr2';
import {SoloError} from '../../core/errors/solo-error.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags as flags, Flags} from '../flags.js';
import {AnyObject, type ArgvStruct} from '../../types/aliases.js';
import {type SoloListrTask, SoloListrTaskWrapper} from '../../types/index.js';
import {type CommandFlag, type CommandFlags} from '../../types/flag-types.js';
import {injectable, inject} from 'tsyringe-neo';
import {v4 as uuid4} from 'uuid';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {StringEx} from '../../business/utils/string-ex.js';
import {ArgumentProcessor} from '../../argument-processor.js';
import {OneShotCommand} from './one-shot.js';
import {OneShotSingleDeployConfigClass} from './one-shot-single-deploy-config-class.js';
import {OneShotSingleDeployContext} from './one-shot-single-deploy-context.js';
import {OneShotSingleDestroyConfigClass} from './one-shot-single-destroy-config-class.js';
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
import {AccountId, HbarUnit} from '@hiero-ledger/sdk';
import * as helpers from '../../core/helpers.js';
import {Duration} from '../../core/time/duration.js';
import {resolveNamespaceFromDeployment} from '../../core/resolvers.js';
import fs from 'node:fs';
import yaml from 'yaml';

@injectable()
export class DefaultOneShotCommand extends BaseCommand implements OneShotCommand {
  private static readonly SINGLE_ADD_CONFIGS_NAME: string = 'singleAddConfigs';

  private static readonly SINGLE_DESTROY_CONFIGS_NAME: string = 'singleDestroyConfigs';

  public static readonly ADD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.numberOfConsensusNodes],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet],
  };

  // Flag sets for the new "falcon" subcommands. These mirror the base one-shot flag sets
  // but also include the chart values override flag `--values-file`.
  public static readonly FALCON_ADD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.valuesFile, flags.numberOfConsensusNodes],
  };

  public static readonly FALCON_DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [...DefaultOneShotCommand.DESTROY_FLAGS_LIST.optional, flags.valuesFile],
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

  /**
   * Appends non-empty config entries to the argv array as CLI flags.
   * @param argv - The argument array to append to
   * @param configSection - The config object to extract key-value pairs from
   */
  private appendConfigToArgv(argv: string[], configSection: AnyObject): void {
    if (!configSection) {
      return;
    }
    for (const [key, value] of Object.entries(configSection)) {
      if (value !== undefined && value !== null && value !== StringEx.EMPTY) {
        argv.push(`${key}`, value.toString());
      }
    }
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
    let config: OneShotSingleDeployConfigClass | null = null;

    const tasks: Listr<OneShotSingleDeployContext, ListrRendererValue, ListrRendererValue> =
      this.taskList.newOneShotSingleDeployTaskList(
        [
          {
            title: 'Initialize',
            task: async (
              context_: OneShotSingleDeployContext,
              task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
            ): Promise<void> => {
              this.configManager.update(argv);

              flags.disablePrompts(DefaultOneShotCommand.ADD_FLAGS_LIST.optional);

              const allFlags: CommandFlag[] = [
                ...DefaultOneShotCommand.ADD_FLAGS_LIST.required,
                ...DefaultOneShotCommand.ADD_FLAGS_LIST.optional,
              ];

              await this.configManager.executePrompt(task, allFlags);

              context_.config = this.configManager.getConfig(
                DefaultOneShotCommand.SINGLE_ADD_CONFIGS_NAME,
                allFlags,
              ) as OneShotSingleDeployConfigClass;
              config = context_.config;

              const uniquePostfix: string = uuid4().slice(-8);

              // Initialize component config sections to empty objects to prevent undefined errors
              config.consensusNodeCfg = {};
              config.mirrorNodeCfg = {};
              config.blockNodeCfg = {};
              config.explorerNodeCfg = {};
              config.relayNodeCfg = {};
              config.networkCfg = {};
              config.setupCfg = {};

              // if valuesFile is set, read the yaml file and save flags to different config sections to be used
              // later for consensus node, mirror node, block node, explorer node, relay node
              if (context_.config.valuesFile) {
                const valuesFileContent: string = fs.readFileSync(context_.config.valuesFile, 'utf8');
                const profileItems = yaml.parse(valuesFileContent) as Record<string, AnyObject>;

                // Override with values from file if they exist
                if (profileItems.network) {
                  config.networkCfg = profileItems.network;
                }
                if (profileItems.setup) {
                  config.setupCfg = profileItems.setup;
                }
                if (profileItems.consensusNode) {
                  config.consensusNodeCfg = profileItems.consensusNode;
                }
                if (profileItems.mirrorNode) {
                  config.mirrorNodeCfg = profileItems.mirrorNode;
                }
                if (profileItems.blockNode) {
                  config.blockNodeCfg = profileItems.blockNode;
                }
                if (profileItems.explorerNode) {
                  config.explorerNodeCfg = profileItems.explorerNode;
                }
                if (profileItems.relayNode) {
                  config.relayNodeCfg = profileItems.relayNode;
                }
              }
              if (config.networkCfg && config.networkCfg['--cluster-ref']) {
                context_.config.clusterRef = config.networkCfg['--cluster-ref'] as string;
                console.log(`Adding cluster-ref from values file: ${context_.config.clusterRef}`);
              }
              context_.config.clusterRef = context_.config.clusterRef || `solo-${uniquePostfix}`;
              context_.config.context = context_.config.context || this.k8Factory.default().contexts().readCurrent();
              context_.config.deployment = context_.config.deployment || `solo-deployment-${uniquePostfix}`;
              context_.config.namespace = context_.config.namespace || NamespaceName.of(`solo-${uniquePostfix}`);
              context_.config.numberOfConsensusNodes = context_.config.numberOfConsensusNodes || 1;

              context_.createdAccounts = [];

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
                ...ClusterReferenceCommandDefinition.CONNECT_COMMAND.split(' '),
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
                ...DeploymentCommandDefinition.CREATE_COMMAND.split(' '),
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.namespace),
                config.namespace.name,
              );
              return this.argvPushGlobalFlags(argv);
            },
          ),
          this.invokeSoloCommand(
            `solo ${DeploymentCommandDefinition.ATTACH_COMMAND}`,
            DeploymentCommandDefinition.ATTACH_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ...DeploymentCommandDefinition.ATTACH_COMMAND.split(' '),
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
                ...ClusterReferenceCommandDefinition.SETUP_COMMAND.split(' '),
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
                ...KeysCommandDefinition.KEYS_COMMAND.split(' '),
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
                ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
                this.optionFromFlag(Flags.deployment),
                config.deployment,
              );
              if (config.networkCfg) {
                this.appendConfigToArgv(argv, config.networkCfg);
              }
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand(
            `solo ${ConsensusCommandDefinition.SETUP_COMMAND}`,
            ConsensusCommandDefinition.SETUP_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ...ConsensusCommandDefinition.SETUP_COMMAND.split(' '),
                this.optionFromFlag(Flags.deployment),
                config.deployment,
              );
              this.appendConfigToArgv(argv, config.setupCfg);
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand(
            `solo ${ConsensusCommandDefinition.START_COMMAND}`,
            ConsensusCommandDefinition.START_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ...ConsensusCommandDefinition.START_COMMAND.split(' '),
                this.optionFromFlag(Flags.deployment),
                config.deployment,
              );
              this.appendConfigToArgv(argv, config.consensusNodeCfg);
              return this.argvPushGlobalFlags(argv);
            },
          ),
          this.invokeSoloCommand(
            `solo ${MirrorCommandDefinition.ADD_COMMAND}`,
            MirrorCommandDefinition.ADD_COMMAND,

            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ...MirrorCommandDefinition.ADD_COMMAND.split(' '),
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                config.clusterRef,
                this.optionFromFlag(Flags.pinger),
                this.optionFromFlag(Flags.enableIngress),
              );
              this.appendConfigToArgv(argv, config.mirrorNodeCfg);
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand(
            `solo ${ExplorerCommandDefinition.ADD_COMMAND}`,
            ExplorerCommandDefinition.ADD_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                config.clusterRef,
              );
              this.appendConfigToArgv(argv, config.explorerNodeCfg);
              return this.argvPushGlobalFlags(argv, config.cacheDir);
            },
          ),
          this.invokeSoloCommand(
            `solo ${RelayCommandDefinition.ADD_COMMAND}`,
            RelayCommandDefinition.ADD_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ...RelayCommandDefinition.ADD_COMMAND.split(' '),
                this.optionFromFlag(Flags.deployment),
                config.deployment,
                this.optionFromFlag(Flags.clusterRef),
                config.clusterRef,
                this.optionFromFlag(Flags.nodeAliasesUnparsed),
                'node1',
              );
              this.appendConfigToArgv(argv, config.relayNodeCfg);
              return this.argvPushGlobalFlags(argv);
            },
          ),
          {
            title: 'Create Accounts',
            skip: () => config.predefinedAccounts === false,
            task: async (
              context_: OneShotSingleDeployContext,
              task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
            ): Promise<Listr<OneShotSingleDeployContext>> => {
              await this.localConfig.load();
              await this.remoteConfig.loadAndValidate(argv);

              const self = this;
              const subTasks: SoloListrTask<OneShotSingleDeployContext>[] = [];

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
                      context_: OneShotSingleDeployContext,
                      subTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
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
            task: async (context_: OneShotSingleDeployContext): Promise<void> => {
              this.showOneShotUserNotes(context_);
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
      throw new SoloError(`Error deploying Solo in one-shot mode: ${error.message}`, error);
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

  private showOneShotUserNotes(context_: OneShotSingleDeployContext, isMultiple: boolean = false): void {
    const messageGroupKey: string = isMultiple ? 'one-shot-multiple-user-notes' : 'one-shot-user-notes';
    const title: string = isMultiple ? 'One Shot Multiple User Notes' : 'One Shot User Notes';

    this.logger.addMessageGroup(messageGroupKey, title);
    this.logger.addMessageGroupMessage(messageGroupKey, `Cluster Reference: ${context_.config.clusterRef}`);
    this.logger.addMessageGroupMessage(messageGroupKey, `Deployment Name: ${context_.config.deployment}`);
    this.logger.addMessageGroupMessage(messageGroupKey, `Namespace Name: ${context_.config.namespace.name}`);

    if (isMultiple) {
      this.logger.addMessageGroupMessage(
        messageGroupKey,
        `Number of Consensus Nodes: ${context_.config.numberOfConsensusNodes}`,
      );
    }

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
      this.logger.addMessageGroup(ecdsaGroupKey, 'ECDSA Accounts (Not EVM compatible, See ECDSA Alias Accounts above)');
      this.logger.addMessageGroup(ecdsaAliasGroupKey, 'ECDSA Alias Accounts (EVM compatible)');
      this.logger.addMessageGroup(ed25519GroupKey, 'ED25519 Accounts');

      this.logger.showMessageGroup(messageGroupKey);

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

      if (ecdsaAccounts.length > 0) {
        for (const account of ecdsaAccounts) {
          this.logger.addMessageGroupMessage(
            ecdsaGroupKey,
            `Account ID: ${account.accountId.toString()}, Private Key: 0x${account.data.privateKey.toStringRaw()}, Balance: ${account.data.balance.toString()}`,
          );
        }

        this.logger.showMessageGroup(ecdsaGroupKey);
      }
      this.logger.showUser(
        'for more information on public and private keys see: https://docs.hedera.com/hedera/core-concepts/keys-and-signatures',
      );
    }
  }

  private showPortForwards(): void {
    this.logger.showMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP);
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    return this.destroyInternal(argv, false);
  }

  public async destroyMultiple(argv: ArgvStruct): Promise<boolean> {
    return this.destroyInternal(argv, true);
  }

  private async destroyInternal(argv: ArgvStruct, isMultiple: boolean): Promise<boolean> {
    let config: OneShotSingleDestroyConfigClass;

    const taskArray = [
      {
        title: 'Initialize',
        task: async (context_, task): Promise<void> => {
          this.configManager.update(argv);

          const flagsList = DefaultOneShotCommand.DESTROY_FLAGS_LIST;

          flags.disablePrompts(flagsList.optional);

          const allFlags: CommandFlag[] = [...flagsList.required, ...flagsList.optional];

          await this.configManager.executePrompt(task, allFlags);

          context_.config = this.configManager.getConfig(
            DefaultOneShotCommand.SINGLE_DESTROY_CONFIGS_NAME,
            allFlags,
          ) as OneShotSingleDestroyConfigClass;

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
      this.invokeSoloCommand(
        `solo ${ExplorerCommandDefinition.DESTROY_COMMAND}`,
        ExplorerCommandDefinition.DESTROY_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...ExplorerCommandDefinition.DESTROY_COMMAND.split(' '),
            this.optionFromFlag(flags.clusterRef),
            config.clusterRef,
            this.optionFromFlag(flags.deployment),
            config.deployment,
            this.optionFromFlag(flags.quiet),
            this.optionFromFlag(flags.force),
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
      this.invokeSoloCommand(
        `solo ${MirrorCommandDefinition.DESTROY_COMMAND}`,
        MirrorCommandDefinition.DESTROY_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...MirrorCommandDefinition.DESTROY_COMMAND.split(' '),
            this.optionFromFlag(flags.clusterRef),
            config.clusterRef,
            this.optionFromFlag(flags.deployment),
            config.deployment,
            this.optionFromFlag(flags.quiet),
            this.optionFromFlag(flags.force),
            this.optionFromFlag(flags.devMode),
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
      this.invokeSoloCommand(
        `solo ${RelayCommandDefinition.DESTROY_COMMAND}`,
        RelayCommandDefinition.DESTROY_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...RelayCommandDefinition.DESTROY_COMMAND.split(' '),
            this.optionFromFlag(flags.clusterRef),
            config.clusterRef,
            this.optionFromFlag(flags.deployment),
            config.deployment,
            this.optionFromFlag(flags.nodeAliasesUnparsed),
            'node1',
            this.optionFromFlag(flags.quiet),
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
      this.invokeSoloCommand(
        `solo ${ConsensusCommandDefinition.DESTROY_COMMAND}`,
        ConsensusCommandDefinition.DESTROY_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...ConsensusCommandDefinition.DESTROY_COMMAND.split(' '),
            this.optionFromFlag(flags.deployment),
            config.deployment,
            this.optionFromFlag(flags.quiet),
            this.optionFromFlag(flags.force),
            this.optionFromFlag(flags.deletePvcs),
            this.optionFromFlag(flags.deleteSecrets),
            this.optionFromFlag(flags.enableTimeout),
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
      this.invokeSoloCommand(
        `solo ${ClusterReferenceCommandDefinition.RESET_COMMAND}`,
        ClusterReferenceCommandDefinition.RESET_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...ClusterReferenceCommandDefinition.RESET_COMMAND.split(' '),
            this.optionFromFlag(flags.clusterRef),
            config.clusterRef,
            this.optionFromFlag(flags.quiet),
            this.optionFromFlag(flags.force),
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
      {
        title: 'Delete cache folder',
        task: async (): Promise<void> => {
          fs.rmSync(config.cacheDir, {recursive: true, force: true});
        },
      },
      {title: 'Finish', task: async (): Promise<void> => {}},
    ];

    const tasks = this.taskList.newOneShotSingleDestroyTaskList(taskArray, {
      concurrent: false,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
    });

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(
        `Error destroying Solo in ${isMultiple ? 'one-shot multiple' : 'one-shot'} mode: ${error.message}`,
        error,
      );
    } finally {
      await this.taskList
        .callCloseFunctions()
        .then()
        .catch((error): void => this.logger.error('Error during closing task list:', error));
    }

    return true;
  }

  public async close(): Promise<void> {} // no-op
}
