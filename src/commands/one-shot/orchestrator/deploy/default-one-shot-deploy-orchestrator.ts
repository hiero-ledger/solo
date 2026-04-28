// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type Listr, type ListrBaseClassOptions, type ListrContext, type ListrRendererValue} from 'listr2';
import {
  AccountId,
  type Client,
  HbarUnit,
  PublicKey,
  TopicCreateTransaction,
  TopicId,
  TopicInfoQuery,
} from '@hiero-ledger/sdk';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
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
import {type ConfigManager} from '../../../../core/config-manager.js';
import {type OneShotState} from '../../../../core/one-shot-state.js';
import {type K8Factory} from '../../../../integration/kube/k8-factory.js';
import {type LockManager} from '../../../../core/lock/lock-manager.js';
import {type ComponentFactoryApi} from '../../../../core/config/remote/api/component-factory-api.js';
import {type Lock} from '../../../../core/lock/lock.js';
import {
  type OneShotVersionsObject,
  type OneShotSingleDeployConfigClass,
} from '../../one-shot-single-deploy-config-class.js';
import {type OneShotSingleDeployContext} from '../../one-shot-single-deploy-context.js';
import {
  type CreatedPredefinedAccount,
  predefinedEcdsaAccountsWithAlias,
  PREDEFINED_ACCOUNT_GROUPS,
  type PredefinedAccount,
  type SystemAccount,
} from '../../predefined-accounts.js';
import {type OneShotDeployOrchestrator} from './one-shot-deploy-orchestrator.js';
import {Phase} from '../phase.js';
import {BlockCommandDefinition} from '../../../command-definitions/block-command-definition.js';
import {MirrorCommandDefinition} from '../../../command-definitions/mirror-command-definition.js';
import {ExplorerCommandDefinition} from '../../../command-definitions/explorer-command-definition.js';
import {RelayCommandDefinition} from '../../../command-definitions/relay-command-definition.js';
import {ConsensusCommandDefinition} from '../../../command-definitions/consensus-command-definition.js';
import {ClusterReferenceCommandDefinition} from '../../../command-definitions/cluster-reference-command-definition.js';
import {DeploymentCommandDefinition} from '../../../command-definitions/deployment-command-definition.js';
import {KeysCommandDefinition} from '../../../command-definitions/keys-command-definition.js';
import {invokeSoloCommand} from '../../../command-helpers.js';
import {Flags as flags} from '../../../flags.js';
import * as constants from '../../../../core/constants.js';
import * as helpers from '../../../../core/helpers.js';
import {createDirectoryIfNotExists, entityId, remoteConfigsToDeploymentsTable} from '../../../../core/helpers.js';
import {Duration} from '../../../../core/time/duration.js';
import {ListrLock} from '../../../../core/lock/listr-lock.js';
import {SoloError} from '../../../../core/errors/solo-error.js';
import {Templates} from '../../../../core/templates.js';
import {PathEx} from '../../../../business/utils/path-ex.js';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';
import {NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {type NodeId} from '../../../../types/aliases.js';
import {type CommandFlag, type CommandFlags} from '../../../../types/flag-types.js';
import {type ArgvStruct} from '../../../../types/aliases.js';
import {BlockNodeStateSchema} from '../../../../data/schema/model/remote/state/block-node-state-schema.js';
import {MirrorNodeStateSchema} from '../../../../data/schema/model/remote/state/mirror-node-state-schema.js';
import {ExplorerStateSchema} from '../../../../data/schema/model/remote/state/explorer-state-schema.js';
import {RelayNodeStateSchema} from '../../../../data/schema/model/remote/state/relay-node-state-schema.js';
import {DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {ComponentTypes} from '../../../../core/config/remote/enumerations/component-types.js';
import {ConfigMap} from '../../../../integration/kube/resources/config-map/config-map.js';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import {DeployArgvBuilders} from './deploy-argv-builders.js';
import {Pipeline} from '../pipeline.js';

const SINGLE_DEPLOY_CONFIGS_NAME: string = 'singleAddConfigs';

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
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.OneShotState) private readonly oneShotState: OneShotState,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.LockManager) private readonly leaseManager: LockManager,
    @inject(InjectTokens.ComponentFactory) private readonly componentFactory: ComponentFactoryApi,
  ) {
    this.taskList = patchInject(taskList, InjectTokens.TaskList, this.constructor.name);
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.oneShotState = patchInject(oneShotState, InjectTokens.OneShotState, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.leaseManager = patchInject(leaseManager, InjectTokens.LockManager, this.constructor.name);
    this.componentFactory = patchInject(componentFactory, InjectTokens.ComponentFactory, this.constructor.name);
  }

  public buildDeployPipeline(
    argv: ArgvStruct,
    flagsList: CommandFlags,
    leaseReference: {value?: Lock},
    configReference: {value?: OneShotSingleDeployConfigClass},
  ): Pipeline<OneShotSingleDeployContext> {
    let config: OneShotSingleDeployConfigClass;
    const getConfig = (): OneShotSingleDeployConfigClass => config;

    const phases: Array<Phase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>> = [
      new Phase('Initialize', {
        asListrTask: (_getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Initialize',
          task: async (
            context_: OneShotSingleDeployContext,
            task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
          ): Promise<void> => {
            this.configManager.update(argv);
            this.oneShotState.activate();

            const edgeEnabled: boolean = this.configManager.getFlag(flags.edgeEnabled);
            const versions: OneShotVersionsObject = DeployArgvBuilders.resolveOneShotComponentVersions(edgeEnabled);

            this.configManager.setFlag(flags.releaseTag, versions.consensus);
            this.configManager.setFlag(flags.blockNodeChartVersion, versions.blockNode);
            this.configManager.setFlag(flags.mirrorNodeVersion, versions.mirror);
            this.configManager.setFlag(flags.relayReleaseTag, versions.relay);
            this.configManager.setFlag(flags.explorerVersion, versions.explorer);
            this.configManager.setFlag(flags.soloChartVersion, versions.soloChart);

            flags.disablePrompts(flagsList.optional);

            const allFlags: CommandFlag[] = [...flagsList.required, ...flagsList.optional];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = this.configManager.getConfig(
              SINGLE_DEPLOY_CONFIGS_NAME,
              allFlags,
            ) as OneShotSingleDeployConfigClass;
            config = context_.config;
            configReference.value = config;
            config.argv = argv;

            config.consensusNodeConfiguration = {};
            config.mirrorNodeConfiguration = {};
            config.blockNodeConfiguration = {};
            config.explorerNodeConfiguration = {};
            config.relayNodeConfiguration = {};
            config.networkConfiguration = {};
            config.setupConfiguration = {};
            config.versions = versions;

            config.cacheDir ??= constants.SOLO_CACHE_DIR;

            if (config.valuesFile) {
              const valuesFileContent: string = fs.readFileSync(context_.config.valuesFile, 'utf8');
              const profileItems: Record<string, object> = yaml.parse(valuesFileContent) as Record<string, object>;

              if (profileItems.network) {
                config.networkConfiguration = profileItems.network as object;
              }
              if (profileItems.setup) {
                config.setupConfiguration = profileItems.setup as object;
              }
              if (profileItems.consensusNode) {
                config.consensusNodeConfiguration = profileItems.consensusNode as object;
              }
              if (profileItems.mirrorNode) {
                config.mirrorNodeConfiguration = profileItems.mirrorNode as object;
              }
              if (profileItems.blockNode) {
                config.blockNodeConfiguration = profileItems.blockNode as object;
              }
              if (profileItems.explorerNode) {
                config.explorerNodeConfiguration = profileItems.explorerNode as object;
              }
              if (profileItems.relayNode) {
                config.relayNodeConfiguration = profileItems.relayNode as object;
              }
            }
            config.clusterRef = config.clusterRef || 'one-shot';
            config.context = config.context || this.k8Factory.default().contexts().readCurrent();
            config.deployment = config.deployment || 'one-shot';
            config.namespace = config.namespace || NamespaceName.of('one-shot');
            this.configManager.setFlag(flags.namespace, config.namespace);
            config.numberOfConsensusNodes = config.numberOfConsensusNodes || 1;
            config.force = argv.force as boolean;

            const MINIMUM_CN_VERSION_FOR_SMALL_MEMORY: string = 'v0.72.0-0';
            const MINIMUM_CN_VERSION_FOR_STATE_ON_DISK: string = 'v0.73.0-0';
            const cnVersion: SemanticVersion<string> = new SemanticVersion(versions.consensus);
            if (!config.valuesFile && cnVersion.greaterThanOrEqual(MINIMUM_CN_VERSION_FOR_SMALL_MEMORY)) {
              const defaultsDirectory: string = PathEx.join(constants.SOLO_CACHE_DIR, 'templates');
              const overridesDirectory: string = PathEx.join(defaultsDirectory, 'small-memory');
              const stateOnDiskDirectory: string = PathEx.join(defaultsDirectory, 'small-memory-state-on-disk');
              const mergedDirectory: string = PathEx.join(defaultsDirectory, 'small-memory-merged');
              const settingsOverrideFile: string =
                config.numberOfConsensusNodes > 1 ? 'settings-multinode.txt' : 'settings-single.txt';
              const useStateOnDisk: boolean = cnVersion.greaterThanOrEqual(MINIMUM_CN_VERSION_FOR_STATE_ON_DISK);

              const settingsMergedPath: string = PathEx.join(mergedDirectory, 'settings.txt');
              this.concatConfigFiles(
                PathEx.join(defaultsDirectory, 'settings.txt'),
                PathEx.join(overridesDirectory, settingsOverrideFile),
                settingsMergedPath,
              );
              config.networkConfiguration['--settings-txt'] = useStateOnDisk
                ? this.concatConfigFiles(
                    settingsMergedPath,
                    PathEx.join(stateOnDiskDirectory, 'settings.txt'),
                    settingsMergedPath,
                  )
                : settingsMergedPath;

              config.networkConfiguration['--application-properties'] = this.concatConfigFiles(
                PathEx.join(defaultsDirectory, 'application.properties'),
                PathEx.join(overridesDirectory, 'application.properties'),
                PathEx.join(mergedDirectory, 'application.properties'),
              );

              config.networkConfiguration['--application-env'] = useStateOnDisk
                ? PathEx.join(stateOnDiskDirectory, 'application.env')
                : PathEx.join(overridesDirectory, 'application.env');

              const throttlesFile: string = PathEx.join(overridesDirectory, 'throttles.json');
              if (fs.existsSync(throttlesFile)) {
                config.networkConfiguration['--genesis-throttles-file'] = throttlesFile;
              }
            }

            config.deployMirrorNode = config.deployMirrorNode === undefined ? true : config.deployMirrorNode;
            config.deployExplorer = config.deployExplorer === undefined ? true : config.deployExplorer;
            config.deployRelay = config.deployRelay === undefined ? true : config.deployRelay;

            context_.createdAccounts = [];

            this.logger.debug(`quiet: ${config.quiet}`);
          },
        }),
      }),
      new Phase('Acquire deployment lock', {
        asListrTask: (_getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Acquire deployment lock',
          task: async (
            _: OneShotSingleDeployContext,
            task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
          ): Promise<Listr<OneShotSingleDeployContext>> => {
            leaseReference.value = await this.leaseManager.create();
            return ListrLock.newAcquireLockTask(leaseReference.value, task);
          },
        }),
      }),
      new Phase('Check for other deployments', {
        asListrTask: (_getConfig: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Check for other deployments',
          task: async (
            _: OneShotSingleDeployContext,
            task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
          ): Promise<void> => {
            const existingRemoteConfigs: ConfigMap[] = await this.k8Factory
              .default()
              .configMaps()
              .listForAllNamespaces(Templates.renderConfigMapRemoteConfigLabels());
            if (existingRemoteConfigs.length > 0) {
              const existingDeploymentsTable: string[] = remoteConfigsToDeploymentsTable(existingRemoteConfigs);
              const promptOptions: {default: boolean; message: string} = {
                default: false,
                message:
                  '⚠️ Warning: Existing solo deployment detected in cluster.\n\n' +
                  existingDeploymentsTable.join('\n') +
                  '\n\nCreating another deployment will require additional' +
                  ' CPU and memory resources. Do you want to proceed and create another deployment?',
              };
              const proceed: boolean = await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, promptOptions);
              if (!proceed) {
                throw new SoloError('Aborted by user');
              }
            }
          },
          skip: (context_: OneShotSingleDeployContext): boolean =>
            context_.config.force === true || context_.config.quiet === true,
        }),
      }),
      new Phase('Cluster connect', {
        asListrTask: (getConfig_: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
          invokeSoloCommand(
            `solo ${ClusterReferenceCommandDefinition.CONNECT_COMMAND}`,
            ClusterReferenceCommandDefinition.CONNECT_COMMAND,
            (): string[] => DeployArgvBuilders.buildClusterConnectArgv(getConfig_()),
            this.taskList,
          ),
      }),
      new Phase('Deployment create', {
        asListrTask: (getConfig_: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
          invokeSoloCommand(
            `solo ${DeploymentCommandDefinition.CREATE_COMMAND}`,
            DeploymentCommandDefinition.CREATE_COMMAND,
            (): string[] => DeployArgvBuilders.buildDeploymentCreateArgv(getConfig_()),
            this.taskList,
          ),
      }),
      new Phase('Deployment attach', {
        asListrTask: (getConfig_: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
          invokeSoloCommand(
            `solo ${DeploymentCommandDefinition.ATTACH_COMMAND}`,
            DeploymentCommandDefinition.ATTACH_COMMAND,
            (): string[] => DeployArgvBuilders.buildDeploymentAttachArgv(getConfig_()),
            this.taskList,
          ),
      }),
      new Phase('Cluster setup', {
        asListrTask: (getConfig_: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
          invokeSoloCommand(
            `solo ${ClusterReferenceCommandDefinition.SETUP_COMMAND}`,
            ClusterReferenceCommandDefinition.SETUP_COMMAND,
            (): string[] => DeployArgvBuilders.buildClusterSetupArgv(getConfig_()),
            this.taskList,
          ),
      }),
      new Phase('Keys generate', {
        asListrTask: (getConfig_: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> =>
          invokeSoloCommand(
            `solo ${KeysCommandDefinition.KEYS_COMMAND}`,
            KeysCommandDefinition.KEYS_COMMAND,
            (): string[] => DeployArgvBuilders.buildKeysGenerateArgv(getConfig_()),
            this.taskList,
          ),
      }),
      new Phase('Create remote config components', {
        asListrTask: (getConfig_: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Create remote config components',
          task: async (): Promise<void> => {
            const deployConfig: OneShotSingleDeployConfigClass = getConfig_();
            if (constants.ONE_SHOT_WITH_BLOCK_NODE === 'true') {
              const blockNode: BlockNodeStateSchema = this.componentFactory.createNewBlockNodeComponent(
                deployConfig.clusterRef,
                deployConfig.namespace,
              );
              blockNode.metadata.phase = DeploymentPhase.REQUESTED;
              this.remoteConfig.configuration.components.addNewComponent(
                blockNode,
                ComponentTypes.BlockNode,
                false,
                true,
              );
            }

            if (deployConfig.deployExplorer) {
              const explorer: ExplorerStateSchema = this.componentFactory.createNewExplorerComponent(
                deployConfig.clusterRef,
                deployConfig.namespace,
              );
              explorer.metadata.phase = DeploymentPhase.REQUESTED;
              this.remoteConfig.configuration.components.addNewComponent(
                explorer,
                ComponentTypes.Explorer,
                false,
                true,
              );
            }

            if (deployConfig.deployMirrorNode) {
              const mirrorNode: MirrorNodeStateSchema = this.componentFactory.createNewMirrorNodeComponent(
                deployConfig.clusterRef,
                deployConfig.namespace,
              );
              mirrorNode.metadata.phase = DeploymentPhase.REQUESTED;
              this.remoteConfig.configuration.components.addNewComponent(
                mirrorNode,
                ComponentTypes.MirrorNode,
                false,
                true,
              );
            }

            if (deployConfig.deployRelay) {
              const nodeIds: NodeId[] = [];
              for (const alias of Templates.renderNodeAliasesFromCount(deployConfig.numberOfConsensusNodes, 0)) {
                nodeIds.push(Templates.nodeIdFromNodeAlias(alias));
              }
              const relay: RelayNodeStateSchema = this.componentFactory.createNewRelayComponent(
                deployConfig.clusterRef,
                deployConfig.namespace,
                nodeIds,
              );
              relay.metadata.phase = DeploymentPhase.REQUESTED;
              this.remoteConfig.configuration.components.addNewComponent(relay, ComponentTypes.RelayNodes, false, true);
            }

            await this.remoteConfig.persist();
          },
        }),
      }),
      new Phase('Deploy Solo components', {
        asListrTask: (getConfig_: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => {
          const deployPhases: Array<Phase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>> = [
            new Phase('Deploy block node', {
              asListrTask: (
                getConfig_: () => OneShotSingleDeployConfigClass,
              ): SoloListrTask<OneShotSingleDeployContext> =>
                invokeSoloCommand(
                  `solo ${BlockCommandDefinition.ADD_COMMAND}`,
                  BlockCommandDefinition.ADD_COMMAND,
                  (): string[] => DeployArgvBuilders.buildBlockNodeArgv(getConfig_()),
                  this.taskList,
                  (): boolean => constants.ONE_SHOT_WITH_BLOCK_NODE.toLowerCase() !== 'true',
                ),
            }),
            Phase.composite('Deploy network node', [
              new Phase('Deploy consensus node', {
                asListrTask: (
                  getConfig_: () => OneShotSingleDeployConfigClass,
                ): SoloListrTask<OneShotSingleDeployContext> =>
                  invokeSoloCommand(
                    `solo ${ConsensusCommandDefinition.DEPLOY_COMMAND}`,
                    ConsensusCommandDefinition.DEPLOY_COMMAND,
                    (): string[] => DeployArgvBuilders.buildConsensusDeployArgv(getConfig_()),
                    this.taskList,
                  ),
              }),
              Phase.composite('Setup and start consensus node', [
                new Phase('Setup consensus node', {
                  asListrTask: (
                    getConfig_: () => OneShotSingleDeployConfigClass,
                  ): SoloListrTask<OneShotSingleDeployContext> =>
                    invokeSoloCommand(
                      `solo ${ConsensusCommandDefinition.SETUP_COMMAND}`,
                      ConsensusCommandDefinition.SETUP_COMMAND,
                      (): string[] => DeployArgvBuilders.buildConsensusSetupArgv(getConfig_()),
                      this.taskList,
                    ),
                }),
                new Phase('Start consensus node', {
                  asListrTask: (
                    getConfig_: () => OneShotSingleDeployConfigClass,
                  ): SoloListrTask<OneShotSingleDeployContext> =>
                    invokeSoloCommand(
                      `solo ${ConsensusCommandDefinition.START_COMMAND}`,
                      ConsensusCommandDefinition.START_COMMAND,
                      (): string[] => DeployArgvBuilders.buildConsensusStartArgv(getConfig_()),
                      this.taskList,
                    ),
                }),
                new Phase('Create accounts', {
                  asListrTask: (
                    getConfig_: () => OneShotSingleDeployConfigClass,
                  ): SoloListrTask<OneShotSingleDeployContext> => this.buildCreateAccountsTask(getConfig_()),
                }),
              ]),
            ]),
            new Phase('Deploy mirror node', {
              asListrTask: (
                getConfig_: () => OneShotSingleDeployConfigClass,
              ): SoloListrTask<OneShotSingleDeployContext> =>
                invokeSoloCommand(
                  `solo ${MirrorCommandDefinition.ADD_COMMAND}`,
                  MirrorCommandDefinition.ADD_COMMAND,
                  (): string[] => DeployArgvBuilders.buildMirrorNodeArgv(getConfig_()),
                  this.taskList,
                  (): boolean => !getConfig_().deployMirrorNode,
                ),
            }),
            new Phase('Deploy explorer', {
              asListrTask: (
                getConfig_: () => OneShotSingleDeployConfigClass,
              ): SoloListrTask<OneShotSingleDeployContext> =>
                invokeSoloCommand(
                  `solo ${ExplorerCommandDefinition.ADD_COMMAND}`,
                  ExplorerCommandDefinition.ADD_COMMAND,
                  (): string[] => DeployArgvBuilders.buildExplorerArgv(getConfig_()),
                  this.taskList,
                  (): boolean => !getConfig_().deployExplorer && !getConfig_().minimalSetup,
                ),
            }).withWaitCondition(SoloEventType.MirrorNodeDeployed, Duration.ofMinutes(10)),
            new Phase('Deploy JSON-RPC Relay', {
              asListrTask: (
                getConfig_: () => OneShotSingleDeployConfigClass,
              ): SoloListrTask<OneShotSingleDeployContext> =>
                invokeSoloCommand(
                  `solo ${RelayCommandDefinition.ADD_COMMAND}`,
                  RelayCommandDefinition.ADD_COMMAND,
                  (): string[] => DeployArgvBuilders.buildRelayArgv(getConfig_()),
                  this.taskList,
                  (): boolean => !getConfig_().deployRelay && !getConfig_().minimalSetup,
                ),
            })
              .withWaitCondition(SoloEventType.MirrorNodeDeployed, Duration.ofMinutes(10))
              .withWaitCondition(SoloEventType.NodesStarted, Duration.ofMinutes(5)),
          ];

          return {
            title: 'Deploy Solo components',
            task: (
              _: OneShotSingleDeployContext,
              task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
            ): SoloListr<OneShotSingleDeployContext> =>
              task.newListr(
                deployPhases.map(
                  (
                    phase: Phase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>,
                  ): SoloListrTask<OneShotSingleDeployContext> => phase.asListrTask(getConfig_, this.eventBus),
                ),
                {concurrent: getConfig_().parallelDeploy, rendererOptions: {collapseSubtasks: false}},
              ),
          };
        },
      }),
      new Phase('Finish', {
        asListrTask: (getConfig_: () => OneShotSingleDeployConfigClass): SoloListrTask<OneShotSingleDeployContext> => ({
          title: 'Finish',
          task: async (context_: OneShotSingleDeployContext): Promise<void> => {
            const deployConfig: OneShotSingleDeployConfigClass = getConfig_();
            const outputDirectory: string = this.getOneShotOutputDirectory(context_.config.deployment);
            this.logger.info(`Output directory: ${outputDirectory}`);
            this.showOneShotUserNotes(context_, PathEx.join(outputDirectory, 'notes'));
            this.showVersions(PathEx.join(outputDirectory, 'versions'), deployConfig);
            this.showPortForwards(PathEx.join(outputDirectory, 'forwards'));
            this.showAccounts(context_.createdAccounts, context_, PathEx.join(outputDirectory, 'accounts.json'));
            this.cacheDeploymentName(context_, PathEx.join(constants.SOLO_CACHE_DIR, 'last-one-shot-deployment.txt'));
          },
        }),
      }),
    ];

    return new Pipeline<OneShotSingleDeployContext>(
      phases.map(
        (
          phase: Phase<OneShotSingleDeployConfigClass, OneShotSingleDeployContext>,
        ): SoloListrTask<OneShotSingleDeployContext> => phase.asListrTask(getConfig, this.eventBus),
      ),
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT as ListrBaseClassOptions<OneShotSingleDeployContext>,
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

  private concatConfigFiles(defaultFilePath: string, overrideFilePath: string, outputFilePath: string): string {
    const defaultContent: string = fs.existsSync(defaultFilePath) ? fs.readFileSync(defaultFilePath, 'utf8') : '';
    const overrideContent: string = fs.existsSync(overrideFilePath) ? fs.readFileSync(overrideFilePath, 'utf8') : '';

    const outputDirectory: string = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, {recursive: true});
    }
    fs.writeFileSync(outputFilePath, defaultContent.trimEnd() + '\n' + overrideContent);
    return outputFilePath;
  }

  private getOneShotOutputDirectory(deploymentName: string): string {
    return PathEx.join(constants.SOLO_HOME_DIR, `one-shot-${deploymentName}`);
  }

  private showOneShotUserNotes(context_: OneShotSingleDeployContext, outputFile?: string): void {
    const messageGroupKey: string = 'one-shot-user-notes';
    const title: string = 'One Shot User Notes';

    this.logger.addMessageGroup(messageGroupKey, title);
    const data: string[] = [
      `Cluster Reference: ${context_.config.clusterRef}`,
      `Deployment Name: ${context_.config.deployment}`,
      `Namespace Name: ${context_.config.namespace.name}`,
    ];

    for (const line of data) {
      this.logger.addMessageGroupMessage(messageGroupKey, line);
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

  private showVersions(outputFile: string, config: OneShotSingleDeployConfigClass): void {
    const messageGroupKey: string = 'versions-used';
    this.logger.addMessageGroup(messageGroupKey, 'Versions Used');

    const data: string[] = [
      `Solo Chart Version: ${config.versions.soloChart}`,
      `Consensus Node Version: ${config.versions.consensus}`,
      `Mirror Node Version: ${config.versions.mirror}`,
      `Explorer Version: ${config.versions.explorer}`,
      `JSON RPC Relay Version: ${config.versions.relay}`,
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

  private showPortForwards(outputFile?: string): void {
    this.logger.showMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP);

    if (outputFile) {
      const messages: string[] = this.logger.getMessageGroup(constants.PORT_FORWARDING_MESSAGE_GROUP);
      if (messages?.length > 0) {
        const fileData: string = messages.join('\n') + '\n';
        createDirectoryIfNotExists(outputFile);
        fs.writeFileSync(outputFile, fileData);
        this.logger.showUser(chalk.green(`✅ Port forwarding info saved to file: ${outputFile}`));
      }
    }
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

        const formattedCreatedAccounts: {
          accountId: string;
          privateKey: string;
          publicKey: string;
          balance: string;
          group: string;
          publicAddress?: string;
        }[] = createdAccounts.map(
          (
            account,
          ): {
            accountId: string;
            privateKey: string;
            publicKey: string;
            balance: string;
            group: string;
            publicAddress?: string;
          } => {
            const formattedAccount: {
              accountId: string;
              privateKey: string;
              publicKey: string;
              balance: string;
              group: string;
              publicAddress?: string;
            } = {
              accountId: account.accountId.toString(),
              privateKey: `0x${account.data.privateKey.toStringRaw()}`,
              publicKey: `0x${PublicKey.fromString(account.publicKey).toStringRaw()}`,
              balance: account.data.balance.toString(),
              group: account.data.group,
            };

            if (account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA_ALIAS && account.alias) {
              formattedAccount['publicAddress'] = account.alias;
            }

            return formattedAccount;
          },
        );

        const formattedSystemAccounts: {name: string; accountId: string; publicKey: string; privateKey?: string}[] =
          systemAccounts.map((account): {name: string; accountId: string; publicKey: string; privateKey?: string} => ({
            name: account.name,
            accountId: account.accountId.toString(),
            publicKey: account.publicKey.toString(),
            privateKey: account.privateKey,
          }));

        const outputData: {
          systemAccounts: {name: string; accountId: string; publicKey: string; privateKey?: string}[];
          createdAccounts: {
            accountId: string;
            privateKey: string;
            publicKey: string;
            balance: string;
            group: string;
            publicAddress?: string;
          }[];
        } = {
          systemAccounts: formattedSystemAccounts,
          createdAccounts: formattedCreatedAccounts,
        };

        fs.writeFileSync(outputFile, JSON.stringify(outputData, undefined, 2));
        this.logger.showUser(chalk.green(`✅ Created accounts saved to file in JSON format: ${outputFile}`));
      }

      this.logger.showUser(
        'For more information on public and private keys see: https://docs.hedera.com/hedera/core-concepts/keys-and-signatures',
      );
    }
  }

  private cacheDeploymentName(context: OneShotSingleDeployContext, outputFile: string): void {
    fs.writeFileSync(outputFile, context.config.deployment);
    this.logger.showUser(chalk.green(`✅ Deployment name (${context.config.deployment}) saved to file: ${outputFile}`));
  }
}
