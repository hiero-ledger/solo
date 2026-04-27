// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type Listr, type ListrContext, type ListrRendererValue} from 'listr2';
import {AccountId, type Client, HbarUnit, TopicCreateTransaction, TopicId, TopicInfoQuery} from '@hiero-ledger/sdk';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {type TaskList} from '../../../../core/task-list/task-list.js';
import {type SoloEventBus} from '../../../../core/events/solo-event-bus.js';
import {SoloEventType} from '../../../../core/events/event-types/event-types.js';
import {type SoloListr, type SoloListrTask, type SoloListrTaskWrapper} from '../../../../types/index.js';
import {type Realm, type Shard} from '../../../../types/index.js';
import {type AccountManager} from '../../../../core/account-manager.js';
import {type LocalConfigRuntimeState} from '../../../../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type SoloLogger} from '../../../../core/logging/solo-logger.js';
import {type OneShotSingleDeployConfigClass} from '../../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../../one-shot-single-deploy-context.js';
import {
  type CreatedPredefinedAccount,
  predefinedEcdsaAccountsWithAlias,
  type PredefinedAccount,
} from '../../predefined-accounts.js';
import {type OneShotDeployOrchestrator} from './one-shot-deploy-orchestrator.js';
import {Phase} from '../phase.js';
import {BlockCommandDefinition} from '../../../command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from '../../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../../command-definitions/relay-command-definition.js';
import {ConsensusCommandDefinition} from '../../../command-definitions/consensus-command-definition.js';
import {invokeSoloCommand} from '../../../command-helpers.js';
import * as constants from '../../../../core/constants.js';
import * as helpers from '../../../../core/helpers.js';
import {entityId} from '../../../../core/helpers.js';
import {Duration} from '../../../../core/time/duration.js';
import {
  buildBlockNodeArgv,
  buildConsensusDeployArgv,
  buildConsensusSetupArgv,
  buildConsensusStartArgv,
  buildExplorerArgv,
  buildMirrorNodeArgv,
  buildRelayArgv,
} from './deploy-argv-builders.js';

@injectable()
export class DefaultOneShotDeployOrchestrator implements OneShotDeployOrchestrator {
  public constructor(
    @inject(InjectTokens.TaskList)
    private readonly taskList: TaskList<ListrContext, ListrRendererValue, ListrRendererValue>,
    @inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public buildDeployTaskList(
    config: OneShotSingleDeployConfigClass,
    parentTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
  ): SoloListr<OneShotSingleDeployContext> {
    const phases: Array<Phase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>> = [
      new Phase('Deploy block node', {
        asListrTask: (c: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
          invokeSoloCommand(
            `solo ${BlockCommandDefinition.ADD_COMMAND}`,
            BlockCommandDefinition.ADD_COMMAND,
            (): string[] => buildBlockNodeArgv(c),
            this.taskList,
            (): boolean => constants.ONE_SHOT_WITH_BLOCK_NODE.toLowerCase() !== 'true',
          ),
      }),
      Phase.composite('Deploy network node', [
        new Phase('Deploy consensus node', {
          asListrTask: (c: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
            invokeSoloCommand(
              `solo ${ConsensusCommandDefinition.DEPLOY_COMMAND}`,
              ConsensusCommandDefinition.DEPLOY_COMMAND,
              (): string[] => buildConsensusDeployArgv(c),
              this.taskList,
            ),
        }),
        Phase.composite('Setup and start consensus node', [
          new Phase('Setup consensus node', {
            asListrTask: (c: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${ConsensusCommandDefinition.SETUP_COMMAND}`,
                ConsensusCommandDefinition.SETUP_COMMAND,
                (): string[] => buildConsensusSetupArgv(c),
                this.taskList,
              ),
          }),
          new Phase('Start consensus node', {
            asListrTask: (c: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              invokeSoloCommand(
                `solo ${ConsensusCommandDefinition.START_COMMAND}`,
                ConsensusCommandDefinition.START_COMMAND,
                (): string[] => buildConsensusStartArgv(c),
                this.taskList,
              ),
          }),
          new Phase('Create accounts', {
            asListrTask: (c: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
              this.buildCreateAccountsTask(c),
          }),
        ]),
      ]),
      new Phase('Deploy mirror node', {
        asListrTask: (c: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
          invokeSoloCommand(
            `solo ${MirrorCommandDefinition.ADD_COMMAND}`,
            MirrorCommandDefinition.ADD_COMMAND,
            (): string[] => buildMirrorNodeArgv(c),
            this.taskList,
            (): boolean => !c.deployMirrorNode,
          ),
      }),
      new Phase('Deploy explorer', {
        asListrTask: (c: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
          invokeSoloCommand(
            `solo ${ExplorerCommandDefinition.ADD_COMMAND}`,
            ExplorerCommandDefinition.ADD_COMMAND,
            (): string[] => buildExplorerArgv(c),
            this.taskList,
            (): boolean => !c.deployExplorer && !c.minimalSetup,
          ),
      }).withWaitCondition(SoloEventType.MirrorNodeDeployed, Duration.ofMinutes(10)),
      new Phase('Deploy JSON-RPC Relay', {
        asListrTask: (c: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
          invokeSoloCommand(
            `solo ${RelayCommandDefinition.ADD_COMMAND}`,
            RelayCommandDefinition.ADD_COMMAND,
            (): string[] => buildRelayArgv(c),
            this.taskList,
            (): boolean => !c.deployRelay && !c.minimalSetup,
          ),
      })
        .withWaitCondition(SoloEventType.MirrorNodeDeployed, Duration.ofMinutes(10))
        .withWaitCondition(SoloEventType.NodesStarted, Duration.ofMinutes(5)),
    ];

    return parentTask.newListr(
      phases.map(
        (
          phase: Phase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>,
        ): SoloListrTask<OneShotSingleDeployContext> => phase.asListrTask(config, this.eventBus),
      ),
      {concurrent: config.parallelDeploy, rendererOptions: {collapseSubtasks: false}},
    );
  }

  private buildCreateAccountsTask(config: OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> {
    return {
      title: 'Create Accounts',
      skip: (): boolean => config.predefinedAccounts === false,
      task: async (
        _: OneShotSingleDeployContext,
        task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
      ): Promise<Listr<OneShotSingleDeployContext>> => {
        await this.localConfig.load();
        await this.remoteConfig.loadAndValidate(config.argv);

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
}
