// SPDX-License-Identifier: Apache-2.0

import {Listr, ListrContext, ListrRendererValue} from 'listr2';
import {SoloError} from '../../core/errors/solo-error.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags as flags, Flags} from '../flags.js';
import {AnyObject, type ArgvStruct} from '../../types/aliases.js';
import {type Realm, type Shard, type SoloListrTask, SoloListrTaskWrapper} from '../../types/index.js';
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
  SystemAccount,
} from './predefined-accounts.js';
import {AccountId, HbarUnit, PublicKey} from '@hiero-ledger/sdk';
import * as helpers from '../../core/helpers.js';
import {Duration} from '../../core/time/duration.js';
import {resolveNamespaceFromDeployment} from '../../core/resolvers.js';
import fs from 'node:fs';
import chalk from 'chalk';
import {PathEx} from '../../business/utils/path-ex.js';
import {createDirectoryIfNotExists, entityId} from '../../core/helpers.js';
import yaml from 'yaml';
import {BlockCommandDefinition} from '../command-definitions/block-command-definition.js';

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

  public static readonly FALCON_ADD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.valuesFile, flags.numberOfConsensusNodes],
  };

  public static readonly FALCON_DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [...DefaultOneShotCommand.DESTROY_FLAGS_LIST.optional],
  };

  public constructor(@inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager) {
    super();
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
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

  public async deploy(argv: ArgvStruct): Promise<boolean> {
    return this.deployInternal(argv, DefaultOneShotCommand.ADD_FLAGS_LIST);
  }

  public async deployFalcon(argv: ArgvStruct): Promise<boolean> {
    return this.deployInternal(argv, DefaultOneShotCommand.FALCON_ADD_FLAGS_LIST);
  }

  private async deployInternal(argv: ArgvStruct, flagsList: CommandFlags): Promise<boolean> {
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

              flags.disablePrompts(flagsList.optional);

              const allFlags: CommandFlag[] = [...flagsList.required, ...flagsList.optional];

              await this.configManager.executePrompt(task, allFlags);

              context_.config = this.configManager.getConfig(
                DefaultOneShotCommand.SINGLE_ADD_CONFIGS_NAME,
                allFlags,
              ) as OneShotSingleDeployConfigClass;
              config = context_.config;

              const uniquePostfix: string = uuid4().slice(-8);

              // Initialize component config sections to empty objects to prevent undefined errors
              config.consensusNodeConfiguration = {};
              config.mirrorNodeConfiguration = {};
              config.blockNodeConfiguration = {};
              config.explorerNodeConfiguration = {};
              config.relayNodeConfiguration = {};
              config.networkConfiguration = {};
              config.setupConfiguration = {};

              // if valuesFile is set, read the yaml file and save flags to different config sections to be used
              // later for consensus node, mirror node, block node, explorer node, relay node
              if (context_.config.valuesFile) {
                const valuesFileContent: string = fs.readFileSync(context_.config.valuesFile, 'utf8');
                const profileItems = yaml.parse(valuesFileContent) as Record<string, AnyObject>;

                // Override with values from file if they exist
                if (profileItems.network) {
                  config.networkConfiguration = profileItems.network;
                }
                if (profileItems.setup) {
                  config.setupConfiguration = profileItems.setup;
                }
                if (profileItems.consensusNode) {
                  config.consensusNodeConfiguration = profileItems.consensusNode;
                }
                if (profileItems.mirrorNode) {
                  config.mirrorNodeConfiguration = profileItems.mirrorNode;
                }
                if (profileItems.blockNode) {
                  config.blockNodeConfiguration = profileItems.blockNode;
                }
                if (profileItems.explorerNode) {
                  config.explorerNodeConfiguration = profileItems.explorerNode;
                }
                if (profileItems.relayNode) {
                  config.relayNodeConfiguration = profileItems.relayNode;
                }
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
            `solo ${BlockCommandDefinition.ADD_COMMAND}`,
            BlockCommandDefinition.ADD_COMMAND,
            (): string[] => {
              const argv: string[] = this.newArgv();
              argv.push(
                ...BlockCommandDefinition.ADD_COMMAND.split(' '),
                this.optionFromFlag(Flags.deployment),
                config.deployment,
              );
              return this.argvPushGlobalFlags(argv);
            },
            (): boolean => constants.ONE_SHOT_WITH_BLOCK_NODE.toLowerCase() !== 'true',
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
              if (config.networkConfiguration) {
                this.appendConfigToArgv(argv, config.networkConfiguration);
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
              this.appendConfigToArgv(argv, config.setupConfiguration);
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
              this.appendConfigToArgv(argv, config.consensusNodeConfiguration);
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
              this.appendConfigToArgv(argv, config.mirrorNodeConfiguration);
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
              this.appendConfigToArgv(argv, config.explorerNodeConfiguration);
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
              this.appendConfigToArgv(argv, config.relayNodeConfiguration);
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
                        publicKey: createdAccount.publicKey,
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
              const outputDirectory: string = PathEx.join(
                constants.SOLO_HOME_DIR,
                `one-shot-${context_.config.deployment}`,
              );
              this.showOneShotUserNotes(context_, false, PathEx.join(outputDirectory, 'notes'));
              this.showVersions(PathEx.join(outputDirectory, 'versions'));
              this.showPortForwards(PathEx.join(outputDirectory, 'forwards'));
              this.showAccounts(context_.createdAccounts, context_, PathEx.join(outputDirectory, 'accounts.json'));
              this.cacheDeploymentName(context_, PathEx.join(constants.SOLO_CACHE_DIR, 'last-one-shot-deployment.txt'));

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

  private showOneShotUserNotes(
    context_: OneShotSingleDeployContext,
    isMultiple: boolean = false,
    outputFile?: string,
  ): void {
    const messageGroupKey: string = isMultiple ? 'one-shot-multiple-user-notes' : 'one-shot-user-notes';
    const title: string = isMultiple ? 'One Shot Multiple User Notes' : 'One Shot User Notes';

    this.logger.addMessageGroup(messageGroupKey, title);
    const data = [
      `Cluster Reference: ${context_.config.clusterRef}`,
      `Deployment Name: ${context_.config.deployment}`,
      `Namespace Name: ${context_.config.namespace.name}`,
    ];

    for (const line of data) {
      this.logger.addMessageGroupMessage(messageGroupKey, line);
    }

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

    if (outputFile) {
      const fileData: string = data.join('\n') + '\n';
      createDirectoryIfNotExists(outputFile);
      fs.writeFileSync(outputFile, fileData);
      this.logger.showUser(chalk.green(`✅ User notes saved to file: ${outputFile}`));
    }
  }

  private showVersions(outputFile?: string): void {
    const messageGroupKey: string = 'versions-used';
    this.logger.addMessageGroup(messageGroupKey, 'Versions Used');

    const data = [
      `Solo Chart Version: ${version.SOLO_CHART_VERSION}`,
      `Consensus Node Version: ${version.HEDERA_PLATFORM_VERSION}`,
      `Mirror Node Version: ${version.MIRROR_NODE_VERSION}`,
      `Explorer Version: ${version.EXPLORER_VERSION}`,
      `JSON RPC Relay Version: ${version.HEDERA_JSON_RPC_RELAY_VERSION}`,
    ];

    for (const line of data) {
      this.logger.addMessageGroupMessage(messageGroupKey, line);
    }

    this.logger.showMessageGroup(messageGroupKey);
    if (outputFile) {
      const fileData: string = data.join('\n') + '\n';
      createDirectoryIfNotExists(outputFile);
      fs.writeFileSync(outputFile, fileData);
      this.logger.showUser(chalk.green(`✅ Versions used saved to file: ${outputFile}`));
    }
  }

  private cacheDeploymentName(context: OneShotSingleDeployContext, outputFile: string): void {
    fs.writeFileSync(outputFile, context.config.deployment);
    this.logger.showUser(chalk.green(`✅ Deployment name (${context.config.deployment}) saved to file: ${outputFile}`));
  }

  private showAccounts(
    createdAccounts: CreatedPredefinedAccount[] = [],
    context: OneShotSingleDeployContext,
    outputFile?: string,
  ): void {
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

      const systemAccountsGroupKey: string = 'system-accounts';
      const messageGroupKey: string = 'accounts-created';
      const ecdsaGroupKey: string = 'accounts-created-ecdsa';
      const ecdsaAliasGroupKey: string = 'accounts-created-ecdsa-alias';
      const ed25519GroupKey: string = 'accounts-created-ed25519';

      const realm: Realm = this.localConfig.configuration.realmForDeployment(context.config.deployment);
      const shard: Shard = this.localConfig.configuration.shardForDeployment(context.config.deployment);
      const operatorAccountData: SystemAccount = {
        name: 'Operator',
        accountId: entityId(shard, realm, 2),
        publicKey: constants.GENESIS_PUBLIC_KEY,
      };

      if (constants.GENESIS_KEY === constants.DEFAULT_GENESIS_KEY) {
        operatorAccountData.privateKey = constants.DEFAULT_GENESIS_KEY;
      }

      const systemAccounts: SystemAccount[] = [operatorAccountData];

      if (systemAccounts.length > 0) {
        this.logger.addMessageGroup(systemAccountsGroupKey, 'System Accounts');

        for (const account of systemAccounts) {
          let message: string = `${account.name} Account ID: ${account.accountId.toString()}, Public Key: ${account.publicKey.toString()}`;
          if (account.privateKey) {
            message += `, Private Key: ${account.privateKey}`;
          }
          this.logger.addMessageGroupMessage(systemAccountsGroupKey, message);
        }

        this.logger.showMessageGroup(systemAccountsGroupKey);
      }

      this.logger.addMessageGroup(messageGroupKey, 'Created Accounts');
      this.logger.addMessageGroup(ecdsaGroupKey, 'ECDSA Accounts (Not EVM compatible, See ECDSA Alias Accounts above)');
      this.logger.addMessageGroup(ecdsaAliasGroupKey, 'ECDSA Alias Accounts (EVM compatible)');
      this.logger.addMessageGroup(ed25519GroupKey, 'ED25519 Accounts');

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

      if (outputFile) {
        createDirectoryIfNotExists(outputFile);

        // Format account data in the same way as it appears in the console output
        const formattedCreatedAccounts = createdAccounts.map(account => {
          const formattedAccount = {
            accountId: account.accountId.toString(),
            privateKey: `0x${account.data.privateKey.toStringRaw()}`,
            publicKey: `0x${PublicKey.fromString(account.publicKey).toStringRaw()}`,
            balance: account.data.balance.toString(),
            group: account.data.group,
          };

          // Add alias field for ECDSA_ALIAS accounts
          if (account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA_ALIAS && account.alias) {
            formattedAccount['publicAddress'] = account.alias;
          }

          return formattedAccount;
        });

        // Format system accounts data
        const formattedSystemAccounts = systemAccounts.map(account => ({
          name: account.name,
          accountId: account.accountId.toString(),
          publicKey: account.publicKey.toString(),
          privateKey: account.privateKey,
        }));

        // Create the structured output with both systemAccounts and createdAccounts
        const outputData = {
          systemAccounts: formattedSystemAccounts,
          createdAccounts: formattedCreatedAccounts,
        };

        fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
        this.logger.showUser(chalk.green(`✅ Created accounts saved to file in JSON format: ${outputFile}`));
      }

      this.logger.showUser(
        'For more information on public and private keys see: https://docs.hedera.com/hedera/core-concepts/keys-and-signatures',
      );
    }
  }

  private showPortForwards(outputFile?: string): void {
    this.logger.showMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP);

    if (outputFile) {
      const messages: string[] = this.logger.getMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP);
      const fileData: string = messages.join('\n') + '\n';
      createDirectoryIfNotExists(outputFile);
      fs.writeFileSync(outputFile, fileData);
      this.logger.showUser(chalk.green(`✅ Port forwarding info saved to file: ${outputFile}`));
    }
  }

  public async destroy(argv: ArgvStruct): Promise<boolean> {
    return this.destroyInternal(argv, DefaultOneShotCommand.DESTROY_FLAGS_LIST);
  }

  public async destroyFalcon(argv: ArgvStruct): Promise<boolean> {
    return this.destroyInternal(argv, DefaultOneShotCommand.FALCON_DESTROY_FLAGS_LIST);
  }

  private async destroyInternal(argv: ArgvStruct, flagsList: CommandFlags): Promise<boolean> {
    let config: OneShotSingleDestroyConfigClass;

    const taskArray = [
      {
        title: 'Initialize',
        task: async (context_, task): Promise<void> => {
          this.configManager.update(argv);

          flags.disablePrompts(flagsList.optional);

          const allFlags: CommandFlag[] = [...flagsList.required, ...flagsList.optional];

          await this.configManager.executePrompt(task, allFlags);

          context_.config = this.configManager.getConfig(
            DefaultOneShotCommand.SINGLE_DESTROY_CONFIGS_NAME,
            allFlags,
          ) as OneShotSingleDestroyConfigClass;

          config = context_.config;

          await this.localConfig.load();

          config.cacheDir ??= constants.SOLO_CACHE_DIR;

          config.clusterRef ??= this.localConfig.configuration.clusterRefs.keys().next().value;

          config.context ??= this.localConfig.configuration.clusterRefs.get(config.clusterRef).toString();

          if (!config.deployment) {
            if (this.localConfig.configuration.deployments.length === 0) {
              throw new SoloError('Deployments name is not found in local config');
            }
            config.deployment = this.localConfig.configuration.deployments.get(0).name;
            this.configManager.setFlag(flags.deployment, config.deployment);
          }

          config.namespace ??= await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
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
        `solo ${BlockCommandDefinition.DESTROY_COMMAND}`,
        BlockCommandDefinition.DESTROY_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...BlockCommandDefinition.DESTROY_COMMAND.split(' '),
            this.optionFromFlag(Flags.deployment),
            config.deployment,
            this.optionFromFlag(flags.clusterRef),
            config.clusterRef,
            this.optionFromFlag(flags.quiet),
          );
          return this.argvPushGlobalFlags(argv);
        },
        (): boolean => constants.ONE_SHOT_WITH_BLOCK_NODE.toLowerCase() !== 'true',
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
      this.invokeSoloCommand(
        `solo ${ClusterReferenceCommandDefinition.DISCONNECT_COMMAND}`,
        ClusterReferenceCommandDefinition.DISCONNECT_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...ClusterReferenceCommandDefinition.DISCONNECT_COMMAND.split(' '),
            this.optionFromFlag(flags.clusterRef),
            config.clusterRef,
            this.optionFromFlag(flags.quiet),
          );
          return this.argvPushGlobalFlags(argv);
        },
      ),
      this.invokeSoloCommand(
        `solo ${DeploymentCommandDefinition.DELETE_COMMAND}`,
        DeploymentCommandDefinition.DELETE_COMMAND,
        (): string[] => {
          const argv: string[] = this.newArgv();
          argv.push(
            ...DeploymentCommandDefinition.DELETE_COMMAND.split(' '),
            this.optionFromFlag(flags.deployment),
            config.deployment,
            this.optionFromFlag(flags.quiet),
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
      throw new SoloError(`Error destroying Solo in one-shot mode: ${error.message}`, error);
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
