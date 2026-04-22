// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type Listr, type ListrContext, type ListrRendererValue} from 'listr2';
import {AccountId, type Client, HbarUnit, TopicCreateTransaction, TopicId, TopicInfoQuery} from '@hiero-ledger/sdk';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {type TaskList} from '../../../core/task-list/task-list.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../types/index.js';
import {type ArgvStruct} from '../../../types/aliases.js';
import {type Realm, type Shard} from '../../../types/index.js';
import {type OneShotSingleDeployConfigClass} from '../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../one-shot-single-deploy-context.js';
import {
  type CreatedPredefinedAccount,
  predefinedEcdsaAccountsWithAlias,
  type PredefinedAccount,
} from '../predefined-accounts.js';
import {ConsensusCommandDefinition} from '../../command-definitions/consensus-command-definition.js';
import {Flags} from '../../flags.js';
import {
  appendConfigToArgv,
  argvPushGlobalFlags,
  invokeSoloCommand,
  newArgv,
  optionFromFlag,
} from '../../command-helpers.js';
import {type AccountManager} from '../../../core/account-manager.js';
import {type LocalConfigRuntimeState} from '../../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {Duration} from '../../../core/time/duration.js';
import * as helpers from '../../../core/helpers.js';
import {entityId} from '../../../core/helpers.js';
import {type SoloLogger} from '../../../core/logging/solo-logger.js';

@injectable()
export class DeployNetworkPipelineStep {
  public constructor(
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.LocalConfigRuntimeState)
    private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState)
    private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public buildDeployArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
    );
    if (config.networkConfiguration) {
      appendConfigToArgv(argv, config.networkConfiguration);
    }
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public buildSetupArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ConsensusCommandDefinition.SETUP_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
    );
    appendConfigToArgv(argv, config.setupConfiguration);
    return argvPushGlobalFlags(argv, config.cacheDir);
  }

  public buildStartArgv(config: OneShotSingleDeployConfigClass): string[] {
    const argv: string[] = newArgv();
    argv.push(
      ...ConsensusCommandDefinition.START_COMMAND.split(' '),
      optionFromFlag(Flags.deployment),
      config.deployment,
    );
    appendConfigToArgv(argv, config.consensusNodeConfiguration);
    return argvPushGlobalFlags(argv);
  }

  private buildCreateAccountsTask(
    config: OneShotSingleDeployConfigClass,
    argv: ArgvStruct,
  ): SoloListrTask<OneShotSingleDeployContext> {
    return {
      title: 'Create Accounts',
      skip: (): boolean => config.predefinedAccounts === false,
      task: async (
        _: OneShotSingleDeployContext,
        task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
      ): Promise<Listr<OneShotSingleDeployContext>> => {
        await this.localConfig.load();
        await this.remoteConfig.loadAndValidate(argv);

        const subTasks: SoloListrTask<OneShotSingleDeployContext>[] = [];

        const client: Client = await this.accountManager.loadNodeClient(
          config.namespace,
          this.remoteConfig.getClusterRefs(),
          config.deployment,
        );

        const realm: Realm = this.localConfig.configuration.realmForDeployment(config.deployment);
        const shard: Shard = this.localConfig.configuration.shardForDeployment(config.deployment);

        // Check if Topic with ID 1001 exists, if not create a buffer topic to bump the entity ID counter
        // so that created accounts have IDs start from x.x.1002
        try {
          const entity1001Query: TopicInfoQuery = new TopicInfoQuery().setTopicId(
            TopicId.fromString(entityId(realm, shard, 1001)),
          );
          await entity1001Query.execute(client);
        } catch (topicCheckError) {
          try {
            if (topicCheckError.message.includes('INVALID_TOPIC_ID')) {
              const bufferTopic: TopicCreateTransaction = new TopicCreateTransaction().setTopicMemo(
                'Buffer topic to bump entity IDs',
              );
              await bufferTopic.execute(client);
            }
          } catch (topicCreateError) {
            this.logger.warn(
              'Failed to create topic. Created account IDs may be offset from the expected values.',
              topicCreateError,
            );
          }
        }

        const accountsToCreate: PredefinedAccount[] = [...predefinedEcdsaAccountsWithAlias];

        for (const [index, account] of accountsToCreate.entries()) {
          // inject index to avoid closure issues
          ((currentIndex: number, currentAccount: PredefinedAccount): void => {
            subTasks.push({
              title: `Creating Account ${currentIndex}`,
              task: async (
                context_: OneShotSingleDeployContext,
                subTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
              ): Promise<void> => {
                await helpers.sleep(Duration.ofMillis(100 * currentIndex));

                const createdAccount: {
                  accountId: string;
                  privateKey: string;
                  publicKey: string;
                  balance: number;
                  accountAlias?: string;
                } = await this.accountManager.createNewAccount(
                  context_.config.namespace,
                  currentAccount.privateKey,
                  currentAccount.balance.to(HbarUnit.Hbar).toNumber(),
                  currentAccount.alias,
                  context_.config.context,
                );

                const newCreatedAccount: CreatedPredefinedAccount = {
                  accountId: AccountId.fromString(createdAccount.accountId),
                  data: currentAccount,
                  alias: createdAccount.accountAlias,
                  publicKey: createdAccount.publicKey,
                };
                context_.createdAccounts.push(newCreatedAccount);

                subTask.title = `Account created: ${createdAccount.accountId.toString()}`;
              },
            });
          })(index, account);
        }

        return task.newListr(subTasks, {
          concurrent: config.parallelDeploy,
          rendererOptions: {collapseSubtasks: false},
        });
      },
    };
  }

  public asListrTask(
    config: OneShotSingleDeployConfigClass,
    argv: ArgvStruct,
  ): SoloListrTask<OneShotSingleDeployContext> {
    return {
      title: 'Deploy network node',
      task: async (
        _: OneShotSingleDeployContext,
        networkNodeTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
      ): Promise<Listr<OneShotSingleDeployContext>> => {
        return networkNodeTask.newListr(
          [
            invokeSoloCommand(
              `solo ${ConsensusCommandDefinition.DEPLOY_COMMAND}`,
              ConsensusCommandDefinition.DEPLOY_COMMAND,
              (): string[] => this.buildDeployArgv(config),
              this.taskList,
            ),
            {
              title: 'Setup and Start consensus node',
              task: async (
                __: OneShotSingleDeployContext,
                setupTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
              ): Promise<Listr<OneShotSingleDeployContext>> => {
                return setupTask.newListr(
                  [
                    invokeSoloCommand(
                      `solo ${ConsensusCommandDefinition.SETUP_COMMAND}`,
                      ConsensusCommandDefinition.SETUP_COMMAND,
                      (): string[] => this.buildSetupArgv(config),
                      this.taskList,
                    ),
                    invokeSoloCommand(
                      `solo ${ConsensusCommandDefinition.START_COMMAND}`,
                      ConsensusCommandDefinition.START_COMMAND,
                      (): string[] => this.buildStartArgv(config),
                      this.taskList,
                    ),
                    this.buildCreateAccountsTask(config, argv),
                  ],
                  {concurrent: false, rendererOptions: {collapseSubtasks: false}},
                );
              },
            },
          ],
          {concurrent: false, rendererOptions: {collapseSubtasks: false}},
        );
      },
    };
  }
}
