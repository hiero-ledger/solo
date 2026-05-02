// SPDX-License-Identifier: Apache-2.0

import {Listr, ListrRendererValue} from 'listr2';
import {SoloError} from '../../core/errors/solo-error.js';
import * as constants from '../../core/constants.js';
import {BaseCommand} from '../base.js';
import {Flags as flags, Flags} from '../flags.js';
import {
  type AnyListrContext,
  type AnyObject,
  type ArgvStruct,
  type NodeAlias,
  type NodeId,
} from '../../types/aliases.js';
import {
  type DeploymentName,
  type Optional,
  type Realm,
  type Shard,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../../types/index.js';
import {type CommandFlag, type CommandFlags} from '../../types/flag-types.js';
import {inject, injectable} from 'tsyringe-neo';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {StringEx} from '../../business/utils/string-ex.js';
import {OneShotCommand} from './one-shot.js';
import {OneShotSingleDeployConfigClass, OneShotVersionsObject} from './one-shot-single-deploy-config-class.js';
import {OneShotSingleDeployContext} from './one-shot-single-deploy-context.js';
import {OneShotSingleDestroyConfigClass} from './one-shot-single-destroy-config-class.js';
import * as version from '../../../version.js';
import {confirm as confirmPrompt, select as selectPrompt} from '@inquirer/prompts';
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
  predefinedEcdsaAccountsWithAlias,
  SystemAccount,
} from './predefined-accounts.js';
import {
  AccountId,
  Client,
  HbarUnit,
  PublicKey,
  TopicCreateTransaction,
  TopicId,
  TopicInfoQuery,
} from '@hiero-ledger/sdk';
import * as helpers from '../../core/helpers.js';
import {createDirectoryIfNotExists, entityId, remoteConfigsToDeploymentsTable} from '../../core/helpers.js';
import {Duration} from '../../core/time/duration.js';
import {resolveNamespaceFromDeployment} from '../../core/resolvers.js';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import {PathEx} from '../../business/utils/path-ex.js';
import yaml from 'yaml';
import {BlockCommandDefinition} from '../command-definitions/block-command-definition.js';
import {argvPushGlobalFlags, invokeSoloCommand, newArgv, optionFromFlag} from '../command-helpers.js';
import {ConfigMap} from '../../integration/kube/resources/config-map/config-map.js';
import {type K8} from '../../integration/kube/k8.js';
import {Templates} from '../../core/templates.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {SemanticVersion} from '../../business/utils/semantic-version.js';
import {type Lock} from '../../core/lock/lock.js';
import {ListrLock} from '../../core/lock/listr-lock.js';
import {ResourceNotFoundError} from '../../integration/kube/errors/resource-operation-errors.js';
import {NoKubeConfigContextError} from '../../business/runtime-state/errors/no-kube-config-context-error.js';
import {RelayNodeStateSchema} from '../../data/schema/model/remote/state/relay-node-state-schema.js';
import {DeploymentPhase} from '../../data/schema/model/remote/deployment-phase.js';
import {ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';
import {MirrorNodeStateSchema} from '../../data/schema/model/remote/state/mirror-node-state-schema.js';
import {ExplorerStateSchema} from '../../data/schema/model/remote/state/explorer-state-schema.js';
import {BlockNodeStateSchema} from '../../data/schema/model/remote/state/block-node-state-schema.js';
import {type SoloEventBus} from '../../core/events/solo-event-bus.js';
import {SoloEventType} from '../../core/events/event-types/event-types.js';
import {MirrorNodeDeployedEvent} from '../../core/events/event-types/mirror-node-deployed-event.js';
import {NodesStartedEvent} from '../../core/events/event-types/nodes-started-event.js';
import {DeploymentSchema} from '../../data/schema/model/local/deployment-schema.js';
import {Deployment} from '../../business/runtime-state/config/local/deployment.js';
import {MutableFacadeArray} from '../../business/runtime-state/collection/mutable-facade-array.js';
import {StringFacade} from '../../business/runtime-state/facade/string-facade.js';
import {DeploymentStateSchema} from '../../data/schema/model/remote/deployment-state-schema.js';
import {OneShotInfoContext} from './one-shot-info-context.js';
import {ApplicationVersionsSchema} from '../../data/schema/model/common/application-versions-schema.js';

@injectable()
export class DefaultOneShotCommand extends BaseCommand implements OneShotCommand {
  private static readonly SINGLE_DEPLOY_CONFIGS_NAME: string = 'singleAddConfigs';

  private static readonly SINGLE_DESTROY_CONFIGS_NAME: string = 'singleDestroyConfigs';

  private _isRollback: boolean = false;

  public static readonly DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.quiet,
      flags.force,
      flags.deployment,
      flags.namespace,
      flags.clusterRef,
      flags.minimalSetup,
      flags.rollback,
      flags.parallelDeploy,
      flags.externalAddress,
    ],
  };

  public static readonly MULTI_DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [...DefaultOneShotCommand.DEPLOY_FLAGS_LIST.optional, flags.numberOfConsensusNodes],
  };

  public static readonly DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.deployment],
  };

  public static readonly FALCON_DEPLOY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.quiet,
      flags.force,
      flags.valuesFile,
      flags.numberOfConsensusNodes,
      flags.deployment,
      flags.namespace,
      flags.clusterRef,
      flags.deployMirrorNode,
      flags.deployExplorer,
      flags.deployRelay,
      flags.rollback,
      flags.parallelDeploy,
      flags.externalAddress,
    ],
  };

  public static readonly FALCON_DESTROY_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [...DefaultOneShotCommand.DESTROY_FLAGS_LIST.optional],
  };

  public static readonly INFO_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.deployment],
  };

  public constructor(
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.SoloEventBus) private readonly eventBus: SoloEventBus,
  ) {
    super();
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.eventBus = patchInject(eventBus, InjectTokens.SoloEventBus, this.constructor.name);
  }

  /**
   * Concatenates a default config file with an override file, writing the result to outputFilePath.
   * Later entries in the file override earlier ones, so the override values take precedence.
   */
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
      if (
        value !== undefined &&
        value !== null &&
        value !== StringEx.EMPTY &&
        key !== flags.getFormattedFlagKey(Flags.deployment)
      ) {
        argv.push(`${key}`, value.toString());
      }
    }
  }

  public async deploy(argv: ArgvStruct): Promise<boolean> {
    return this.deployInternal(argv, DefaultOneShotCommand.DEPLOY_FLAGS_LIST);
  }

  public async deployFalcon(argv: ArgvStruct): Promise<boolean> {
    return this.deployInternal(argv, DefaultOneShotCommand.FALCON_DEPLOY_FLAGS_LIST);
  }

  private async performRollback(
    deployError: Error,
    config: OneShotSingleDeployConfigClass | undefined,
  ): Promise<never> {
    if (!config) {
      throw new SoloError(
        `Deploy failed: ${deployError.message}. Rollback skipped: no resources created.`,
        deployError,
      );
    }

    if (config.rollback === false) {
      this.logger.warn('Automatic rollback skipped (--no-rollback flag provided)');
      this.logger.warn('To clean up: solo one-shot single destroy');
      this.logger.warn(`Or: kubectl delete ns ${config.namespace.name}`);
      throw new SoloError(`Deploy failed: ${deployError.message}. Rollback skipped (--no-rollback).`, deployError);
    }

    this.logger.warn(
      `Deploy failed. Starting automatic rollback for deployment '${config.deployment}' in namespace '${config.namespace.name}'...`,
    );

    const destroyArgv: ArgvStruct = {
      _: [],
      deployment: config.deployment,
      clusterRef: config.clusterRef,
      namespace: config.namespace.name,
      context: config.context,
      quiet: true,
    };

    this._isRollback = true;
    try {
      await this.destroyInternal(destroyArgv, DefaultOneShotCommand.DESTROY_FLAGS_LIST);
    } catch (rollbackError) {
      this.logger.error(`Rollback failed for deployment '${config.deployment}': ${rollbackError.message}`);
      throw new SoloError(
        `Deploy failed: ${deployError.message}. Rollback also failed: ${rollbackError.message}`,
        deployError,
      );
    } finally {
      // Safety net: ensure namespace is always deleted during rollback, even if destroyInternal
      // failed or skipped namespace cleanup (e.g. due to skipAll, helm uninstall failure, etc.)
      try {
        const k8: K8 = this.k8Factory.getK8(config.context);
        if (await k8.namespaces().has(config.namespace)) {
          this.logger.warn(`Rollback cleanup: deleting namespace '${config.namespace.name}'`);
          await k8.namespaces().delete(config.namespace);
        }
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to delete namespace '${config.namespace.name}' during rollback cleanup: ${cleanupError.message}`,
        );
      }

      this._isRollback = false;
    }

    this.logger.info(`Rollback complete. Cache preserved at: ${config.cacheDir}`);
    throw new SoloError(`Deploy failed: ${deployError.message}. Rollback completed successfully.`, deployError);
  }

  private async deployInternal(argv: ArgvStruct, flagsList: CommandFlags): Promise<boolean> {
    let config: OneShotSingleDeployConfigClass | undefined = undefined;
    let oneShotLease: Lock | undefined;
    const mirrorNodeId: number = 1;

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
              this.oneShotState.activate();

              const edgeEnabled: boolean = this.configManager.getFlag(Flags.edgeEnabled);
              const versions: OneShotVersionsObject = this.resolveOneShotComponentVersions(edgeEnabled);

              // Pre-set component version flags in configManager so they are available
              // for all sub-commands during concurrent execution
              this.configManager.setFlag(Flags.releaseTag, versions.consensus);
              this.configManager.setFlag(Flags.blockNodeChartVersion, versions.blockNode);
              this.configManager.setFlag(Flags.mirrorNodeVersion, versions.mirror);
              this.configManager.setFlag(Flags.relayReleaseTag, versions.relay);
              this.configManager.setFlag(Flags.explorerVersion, versions.explorer);
              this.configManager.setFlag(Flags.soloChartVersion, versions.soloChart);

              flags.disablePrompts(flagsList.optional);

              const allFlags: CommandFlag[] = [...flagsList.required, ...flagsList.optional];

              await this.configManager.executePrompt(task, allFlags);

              context_.config = this.configManager.getConfig(
                DefaultOneShotCommand.SINGLE_DEPLOY_CONFIGS_NAME,
                allFlags,
              ) as OneShotSingleDeployConfigClass;
              config = context_.config;

              // Initialize component config sections to empty objects to prevent undefined errors
              config.consensusNodeConfiguration = {};
              config.mirrorNodeConfiguration = {};
              config.blockNodeConfiguration = {};
              config.explorerNodeConfiguration = {};
              config.relayNodeConfiguration = {};
              config.networkConfiguration = {};
              config.setupConfiguration = {};
              config.versions = versions;

              config.cacheDir ??= constants.SOLO_CACHE_DIR;

              // if valuesFile is set, read the yaml file and save flags to different config sections to be used
              // later for consensus node, mirror node, block node, explorer node, relay node
              if (config.valuesFile) {
                const valuesFileContent: string = fs.readFileSync(context_.config.valuesFile, 'utf8');
                const profileItems: Record<string, AnyObject> = yaml.parse(valuesFileContent) as Record<
                  string,
                  AnyObject
                >;

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
              config.clusterRef = config.clusterRef || 'one-shot';
              config.context = config.context || this.k8Factory.default().contexts().readCurrent();
              config.deployment = config.deployment || 'one-shot';
              config.namespace = config.namespace || NamespaceName.of('one-shot');
              this.configManager.setFlag(flags.namespace, config.namespace);
              config.numberOfConsensusNodes = config.numberOfConsensusNodes || 1;
              config.force = argv.force;

              // Apply small-memory node configuration only for CN >= 0.72.0 and when not using `one-shot falcon deploy`
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
                // Merge default settings with small-memory overrides
                this.concatConfigFiles(
                  PathEx.join(defaultsDirectory, 'settings.txt'),
                  PathEx.join(overridesDirectory, settingsOverrideFile),
                  settingsMergedPath,
                );
                // For CN >= 0.73.0, append state-on-disk settings
                config.networkConfiguration[flags.getFormattedFlagKey(flags.settingTxt)] = useStateOnDisk
                  ? this.concatConfigFiles(
                      settingsMergedPath,
                      PathEx.join(stateOnDiskDirectory, 'settings.txt'),
                      settingsMergedPath,
                    )
                  : settingsMergedPath;

                config.networkConfiguration[flags.getFormattedFlagKey(flags.applicationProperties)] =
                  this.concatConfigFiles(
                    PathEx.join(defaultsDirectory, 'application.properties'),
                    PathEx.join(overridesDirectory, 'application.properties'),
                    PathEx.join(mergedDirectory, 'application.properties'),
                  );

                // For CN >= 0.73.0, use state-on-disk application.env instead of default small-memory
                config.networkConfiguration[flags.getFormattedFlagKey(flags.applicationEnv)] = useStateOnDisk
                  ? PathEx.join(stateOnDiskDirectory, 'application.env')
                  : PathEx.join(overridesDirectory, 'application.env');

                const throttlesFile: string = PathEx.join(overridesDirectory, 'throttles.json');
                if (fs.existsSync(throttlesFile)) {
                  config.networkConfiguration[flags.getFormattedFlagKey(flags.genesisThrottlesFile)] = throttlesFile;
                }
              }

              // Auto-enable PVCs in network configuration when --local-build-path is used in setup configuration.
              // Node PVCs are required to persist custom JARs across pod restarts.
              if (
                config.setupConfiguration[flags.getFormattedFlagKey(flags.localBuildPath)] &&
                !config.networkConfiguration[flags.getFormattedFlagKey(flags.persistentVolumeClaims)]
              ) {
                this.logger.info(
                  'Auto-enabling PVCs in network configuration because --local-build-path is set in setup. ' +
                    'Node PVCs are required to persist custom JARs across pod restarts.',
                );
                config.networkConfiguration[flags.getFormattedFlagKey(flags.persistentVolumeClaims)] = 'true';
              }

              // Initialize deployment toggles with defaults if not specified
              config.deployMirrorNode = config.deployMirrorNode === undefined ? true : config.deployMirrorNode;
              config.deployExplorer = config.deployExplorer === undefined ? true : config.deployExplorer;
              config.deployRelay = config.deployRelay === undefined ? true : config.deployRelay;

              context_.createdAccounts = [];

              this.logger.debug(`quiet: ${config.quiet}`);

              return;
            },
          },
          {
            title: 'Acquire deployment lock',
            task: async (
              _: OneShotSingleDeployContext,
              task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
            ): Promise<Listr<OneShotSingleDeployContext>> => {
              oneShotLease = await this.leaseManager.create();
              return ListrLock.newAcquireLockTask(oneShotLease, task);
            },
          },
          {
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
                const proceed: boolean = await task
                  .prompt(ListrInquirerPromptAdapter)
                  .run(confirmPrompt, promptOptions);
                if (!proceed) {
                  throw new SoloError('Aborted by user');
                }
              }
            },
            skip: (context_: OneShotSingleDeployContext): boolean =>
              context_.config.force === true || context_.config.quiet === true,
          },
          invokeSoloCommand(
            `solo ${ClusterReferenceCommandDefinition.CONNECT_COMMAND}`,
            ClusterReferenceCommandDefinition.CONNECT_COMMAND,
            (): string[] => {
              const argv: string[] = newArgv();
              argv.push(
                ...ClusterReferenceCommandDefinition.CONNECT_COMMAND.split(' '),
                optionFromFlag(Flags.clusterRef),
                config.clusterRef,
                optionFromFlag(Flags.context),
                config.context,
              );
              return argvPushGlobalFlags(argv);
            },
            this.taskList,
          ),
          invokeSoloCommand(
            `solo ${DeploymentCommandDefinition.CREATE_COMMAND}`,
            DeploymentCommandDefinition.CREATE_COMMAND,
            (): string[] => {
              const argv: string[] = newArgv();
              argv.push(
                ...DeploymentCommandDefinition.CREATE_COMMAND.split(' '),
                optionFromFlag(Flags.deployment),
                config.deployment,
                optionFromFlag(Flags.namespace),
                config.namespace.name,
              );
              return argvPushGlobalFlags(argv);
            },
            this.taskList,
          ),
          invokeSoloCommand(
            `solo ${DeploymentCommandDefinition.ATTACH_COMMAND}`,
            DeploymentCommandDefinition.ATTACH_COMMAND,
            (): string[] => {
              const argv: string[] = newArgv();
              argv.push(
                ...DeploymentCommandDefinition.ATTACH_COMMAND.split(' '),
                optionFromFlag(Flags.deployment),
                config.deployment,
                optionFromFlag(Flags.clusterRef),
                config.clusterRef,
                optionFromFlag(Flags.numberOfConsensusNodes),
                config.numberOfConsensusNodes.toString(),
              );
              return argvPushGlobalFlags(argv);
            },
            this.taskList,
          ),
          invokeSoloCommand(
            `solo ${ClusterReferenceCommandDefinition.SETUP_COMMAND}`,
            ClusterReferenceCommandDefinition.SETUP_COMMAND,
            (): string[] => {
              const argv: string[] = newArgv();
              argv.push(
                ...ClusterReferenceCommandDefinition.SETUP_COMMAND.split(' '),
                optionFromFlag(Flags.clusterRef),
                config.clusterRef,
              );
              return argvPushGlobalFlags(argv);
            },
            this.taskList,
          ),
          invokeSoloCommand(
            `solo ${KeysCommandDefinition.KEYS_COMMAND}`,
            KeysCommandDefinition.KEYS_COMMAND,
            (): string[] => {
              const argv: string[] = newArgv();
              argv.push(
                ...KeysCommandDefinition.KEYS_COMMAND.split(' '),
                optionFromFlag(Flags.deployment),
                config.deployment,
                optionFromFlag(Flags.generateGossipKeys),
                'true',
                optionFromFlag(Flags.generateTlsKeys),
              );
              return argvPushGlobalFlags(argv, config.cacheDir);
            },
            this.taskList,
          ),
          {
            title: 'Create remote config components',
            task: async (): Promise<void> => {
              // Pre add remote config components to remote config

              if (constants.ONE_SHOT_WITH_BLOCK_NODE === 'true') {
                // Add Block Node
                const blockNode: BlockNodeStateSchema = this.componentFactory.createNewBlockNodeComponent(
                  config.clusterRef,
                  config.namespace,
                );

                blockNode.metadata.phase = DeploymentPhase.REQUESTED;

                this.remoteConfig.configuration.components.addNewComponent(
                  blockNode,
                  ComponentTypes.BlockNode,
                  false,
                  true,
                );
              }

              // Add Explorer
              if (config.deployExplorer) {
                const explorer: ExplorerStateSchema = this.componentFactory.createNewExplorerComponent(
                  config.clusterRef,
                  config.namespace,
                );

                explorer.metadata.phase = DeploymentPhase.REQUESTED;

                this.remoteConfig.configuration.components.addNewComponent(
                  explorer,
                  ComponentTypes.Explorer,
                  false,
                  true,
                );
              }

              // Add Mirror Node
              if (config.deployMirrorNode) {
                const mirrorNode: MirrorNodeStateSchema = this.componentFactory.createNewMirrorNodeComponent(
                  config.clusterRef,
                  config.namespace,
                );

                mirrorNode.metadata.phase = DeploymentPhase.REQUESTED;

                this.remoteConfig.configuration.components.addNewComponent(
                  mirrorNode,
                  ComponentTypes.MirrorNode,
                  false,
                  true,
                );
              }

              // Add Relay
              if (config.deployRelay) {
                const nodeIds: NodeId[] = [];

                for (const alias of Templates.renderNodeAliasesFromCount(config.numberOfConsensusNodes, 0)) {
                  nodeIds.push(Templates.nodeIdFromNodeAlias(alias));
                }

                const relay: RelayNodeStateSchema = this.componentFactory.createNewRelayComponent(
                  config.clusterRef,
                  config.namespace,
                  nodeIds,
                );

                relay.metadata.phase = DeploymentPhase.REQUESTED;

                this.remoteConfig.configuration.components.addNewComponent(
                  relay,
                  ComponentTypes.RelayNodes,
                  false,
                  true,
                );
              }

              await this.remoteConfig.persist();
            },
          },
          {
            title: 'Deploy Solo components',
            task: (_, task): SoloListr<OneShotSingleDeployContext> => {
              // Network node pipeline: deploy network node, then setup, start consensus node, and account generation
              // Must be sequential
              const deployNetworkNodeTask = {
                title: 'Deploy network node',
                task: async (_, networkNodeTask): Promise<SoloListr<OneShotSingleDeployContext>> => {
                  return networkNodeTask.newListr(
                    [
                      invokeSoloCommand(
                        `solo ${ConsensusCommandDefinition.DEPLOY_COMMAND}`,
                        ConsensusCommandDefinition.DEPLOY_COMMAND,
                        (): string[] => {
                          const argv: string[] = newArgv();
                          argv.push(
                            ...ConsensusCommandDefinition.DEPLOY_COMMAND.split(' '),
                            optionFromFlag(Flags.deployment),
                            config.deployment,
                          );
                          if (config.networkConfiguration) {
                            this.appendConfigToArgv(argv, config.networkConfiguration);
                          }
                          return argvPushGlobalFlags(argv, config.cacheDir);
                        },
                        this.taskList,
                      ),
                      {
                        title: 'Setup and Start consensus node',
                        task: async (
                          _: OneShotSingleDeployContext,
                          task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
                        ): Promise<SoloListr<OneShotSingleDeployContext>> => {
                          return task.newListr(
                            [
                              invokeSoloCommand(
                                `solo ${ConsensusCommandDefinition.SETUP_COMMAND}`,
                                ConsensusCommandDefinition.SETUP_COMMAND,
                                (): string[] => {
                                  const argv: string[] = newArgv();
                                  argv.push(
                                    ...ConsensusCommandDefinition.SETUP_COMMAND.split(' '),
                                    optionFromFlag(Flags.deployment),
                                    config.deployment,
                                  );
                                  this.appendConfigToArgv(argv, config.setupConfiguration);
                                  return argvPushGlobalFlags(argv, config.cacheDir);
                                },
                                this.taskList,
                              ),
                              invokeSoloCommand(
                                `solo ${ConsensusCommandDefinition.START_COMMAND}`,
                                ConsensusCommandDefinition.START_COMMAND,
                                (): string[] => {
                                  const argv: string[] = newArgv();
                                  argv.push(
                                    ...ConsensusCommandDefinition.START_COMMAND.split(' '),
                                    optionFromFlag(Flags.deployment),
                                    config.deployment,
                                  );
                                  this.appendConfigToArgv(argv, {
                                    [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
                                    ...config.consensusNodeConfiguration,
                                  });
                                  return argvPushGlobalFlags(argv);
                                },
                                this.taskList,
                              ),
                              {
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

                                  const realm: Realm = this.localConfig.configuration.realmForDeployment(
                                    config.deployment,
                                  );
                                  const shard: Shard = this.localConfig.configuration.shardForDeployment(
                                    config.deployment,
                                  );

                                  // Check if Topic with ID 1001 exists, if not create a buffer topic to bump the entity ID counter
                                  // so that created accounts have IDs start from x.x.1002
                                  try {
                                    const entity1001Query: TopicInfoQuery = new TopicInfoQuery().setTopicId(
                                      TopicId.fromString(entityId(realm, shard, 1001)),
                                    );
                                    await entity1001Query.execute(client);
                                  } catch (error) {
                                    try {
                                      if (error.message.includes('INVALID_TOPIC_ID')) {
                                        const bufferTopic: TopicCreateTransaction =
                                          new TopicCreateTransaction().setTopicMemo('Buffer topic to bump entity IDs');
                                        await bufferTopic.execute(client);
                                      }
                                    } catch (error) {
                                      this.logger.warn(
                                        'Failed to create topic. Created account IDs may be offset from the expected values.',
                                        error,
                                      );
                                    }
                                  }

                                  const accountsToCreate: PredefinedAccount[] = [...predefinedEcdsaAccountsWithAlias];

                                  for (const [index, account] of accountsToCreate.entries()) {
                                    // inject index to avoid closure issues
                                    ((index: number, account: PredefinedAccount): void => {
                                      subTasks.push({
                                        title: `Creating Account ${index}`,
                                        task: async (
                                          context_: OneShotSingleDeployContext,
                                          subTask: SoloListrTaskWrapper<OneShotSingleDeployContext>,
                                        ): Promise<void> => {
                                          await helpers.sleep(Duration.ofMillis(100 * index));

                                          const createdAccount: {
                                            accountId: string;
                                            privateKey: string;
                                            publicKey: string;
                                            balance: number;
                                            accountAlias?: string;
                                          } = await this.accountManager.createNewAccount(
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

                                  return task.newListr(subTasks, {
                                    concurrent: config.parallelDeploy,
                                    rendererOptions: {collapseSubtasks: false},
                                  });
                                },
                              },
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

              return task.newListr(
                [
                  invokeSoloCommand(
                    `solo ${BlockCommandDefinition.ADD_COMMAND}`,
                    BlockCommandDefinition.ADD_COMMAND,
                    (): string[] => {
                      const argv: string[] = newArgv();
                      argv.push(
                        ...BlockCommandDefinition.ADD_COMMAND.split(' '),
                        optionFromFlag(Flags.deployment),
                        config.deployment,
                      );

                      // Build a local copy with the dev image values file appended, without mutating
                      // config.blockNodeConfiguration — it may be an alias for another section's object
                      // (e.g. via YAML anchors), causing the values file to leak into other commands.
                      const blockExistingValuesFile: string =
                        config.blockNodeConfiguration?.[flags.getFormattedFlagKey(Flags.valuesFile)];
                      const blockLocalConfig: AnyObject = {
                        ...config.blockNodeConfiguration,
                        [flags.getFormattedFlagKey(Flags.valuesFile)]: blockExistingValuesFile
                          ? `${blockExistingValuesFile},${constants.BLOCK_NODE_SOLO_DEV_FILE}`
                          : constants.BLOCK_NODE_SOLO_DEV_FILE,
                      };
                      this.appendConfigToArgv(argv, blockLocalConfig);
                      return argvPushGlobalFlags(argv);
                    },
                    this.taskList,
                    (): boolean => constants.ONE_SHOT_WITH_BLOCK_NODE.toLowerCase() !== 'true',
                  ),
                  deployNetworkNodeTask,
                  invokeSoloCommand(
                    `solo ${MirrorCommandDefinition.ADD_COMMAND}`,
                    MirrorCommandDefinition.ADD_COMMAND,
                    (): string[] => {
                      const argv: string[] = newArgv();
                      argv.push(
                        ...MirrorCommandDefinition.ADD_COMMAND.split(' '),
                        optionFromFlag(Flags.deployment),
                        config.deployment,
                        optionFromFlag(Flags.clusterRef),
                        config.clusterRef,
                        optionFromFlag(Flags.pinger),
                        optionFromFlag(Flags.enableIngress),
                        optionFromFlag(Flags.parallelDeploy),
                        config.parallelDeploy.toString(),
                      );
                      // Append HikariCP limits file without mutating the shared config object.
                      const mirrorExistingValuesFile: string =
                        config.mirrorNodeConfiguration?.[flags.getFormattedFlagKey(Flags.valuesFile)];
                      const mirrorLocalConfig: AnyObject = {
                        [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
                        ...config.mirrorNodeConfiguration,
                        [flags.getFormattedFlagKey(Flags.valuesFile)]: mirrorExistingValuesFile
                          ? `${mirrorExistingValuesFile},${constants.MIRROR_NODE_HIKARI_LIMITS_FILE}`
                          : constants.MIRROR_NODE_HIKARI_LIMITS_FILE,
                      };
                      this.appendConfigToArgv(argv, mirrorLocalConfig);
                      return argvPushGlobalFlags(argv, config.cacheDir);
                    },
                    this.taskList,
                    (): boolean => !config.deployMirrorNode,
                  ),
                  invokeSoloCommand(
                    `solo ${ExplorerCommandDefinition.ADD_COMMAND}`,
                    ExplorerCommandDefinition.ADD_COMMAND,
                    async (): Promise<string[]> => {
                      await this.eventBus.waitFor(
                        SoloEventType.MirrorNodeDeployed,
                        (soloEvent: MirrorNodeDeployedEvent): boolean => soloEvent.deployment === config.deployment,
                        Duration.ofMinutes(5),
                      );
                      const argv: string[] = newArgv();
                      argv.push(
                        ...ExplorerCommandDefinition.ADD_COMMAND.split(' '),
                        optionFromFlag(Flags.deployment),
                        config.deployment,
                        optionFromFlag(Flags.clusterRef),
                        config.clusterRef,
                      );
                      this.appendConfigToArgv(argv, {
                        [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
                        [optionFromFlag(Flags.explorerVersion)]: config.versions.explorer,
                        [optionFromFlag(Flags.mirrorNodeId)]: mirrorNodeId,
                        [optionFromFlag(Flags.mirrorNamespace)]: config.namespace.name,
                        ...config.explorerNodeConfiguration,
                      });
                      return argvPushGlobalFlags(argv, config.cacheDir);
                    },
                    this.taskList,
                    (): boolean => !config.deployExplorer && !config.minimalSetup,
                  ),
                  invokeSoloCommand(
                    `solo ${RelayCommandDefinition.ADD_COMMAND}`,
                    RelayCommandDefinition.ADD_COMMAND,
                    async (): Promise<string[]> => {
                      await this.eventBus.waitFor(
                        SoloEventType.MirrorNodeDeployed,
                        (soloEvent: MirrorNodeDeployedEvent): boolean => soloEvent.deployment === config.deployment,
                        Duration.ofMinutes(5),
                      );
                      await this.eventBus.waitFor(
                        SoloEventType.NodesStarted,
                        (soloEvent: NodesStartedEvent): boolean => soloEvent.deployment === config.deployment,
                        Duration.ofMinutes(5),
                      );
                      const argv: string[] = newArgv();
                      argv.push(
                        ...RelayCommandDefinition.ADD_COMMAND.split(' '),
                        optionFromFlag(Flags.deployment),
                        config.deployment,
                        optionFromFlag(Flags.clusterRef),
                        config.clusterRef,
                        optionFromFlag(Flags.nodeAliasesUnparsed),
                        'node1',
                      );
                      this.appendConfigToArgv(argv, {
                        [optionFromFlag(Flags.externalAddress)]: config.externalAddress,
                        [optionFromFlag(Flags.mirrorNodeId)]: mirrorNodeId,
                        [optionFromFlag(Flags.mirrorNamespace)]: config.namespace.name,
                        ...config.relayNodeConfiguration,
                      });
                      return argvPushGlobalFlags(argv);
                    },
                    this.taskList,
                    (): boolean => !config.deployRelay && !config.minimalSetup,
                  ),
                ],
                {concurrent: config.parallelDeploy, rendererOptions: {collapseSubtasks: false}},
              );
            },
          },
          {
            title: 'Finish',
            task: async (context_: OneShotSingleDeployContext): Promise<void> => {
              const outputDirectory: string = this.getOneShotOutputDirectory(context_.config.deployment);
              this.logger.info(`Output directory: ${outputDirectory}`);
              this.showOneShotUserNotes(context_, false, PathEx.join(outputDirectory, 'notes'));
              this.showVersions(PathEx.join(outputDirectory, 'versions'), config);
              this.showPortForwards(PathEx.join(outputDirectory, 'forwards'));
              this.showAccounts(context_.createdAccounts, context_, PathEx.join(outputDirectory, 'accounts.json'));
              this.cacheDeploymentName(context_, PathEx.join(constants.SOLO_CACHE_DIR, 'last-one-shot-deployment.txt'));

              return;
            },
          },
        ],
        constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      );

    try {
      await tasks.run();
    } catch (error) {
      await this.performRollback(error, config);
    } finally {
      this.oneShotState.deactivate();
      const cleanupPromises: Promise<void>[] = [];
      if (oneShotLease) {
        cleanupPromises.push(
          oneShotLease.release(true).catch((error): void => {
            this.logger.error('Error releasing one-shot lease:', error);
          }),
        );
      }
      cleanupPromises.push(
        this.taskList
          .callCloseFunctions()
          .then()
          .catch((error): void => {
            this.logger.error('Error during closing task list:', error);
          }),
      );
      await Promise.all(cleanupPromises);
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
    const data: string[] = [
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

  private cacheDeploymentName(context: OneShotSingleDeployContext, outputFile: string): void {
    fs.writeFileSync(outputFile, context.config.deployment);
    this.logger.showUser(chalk.green(`✅ Deployment name (${context.config.deployment}) saved to file: ${outputFile}`));
  }

  private getOneShotOutputDirectory(deploymentName: string): string {
    return PathEx.join(constants.SOLO_HOME_DIR, `one-shot-${deploymentName}`);
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

            // Add alias field for ECDSA_ALIAS accounts
            if (account.data.group === PREDEFINED_ACCOUNT_GROUPS.ECDSA_ALIAS && account.alias) {
              formattedAccount['publicAddress'] = account.alias;
            }

            return formattedAccount;
          },
        );

        // Format system accounts data
        const formattedSystemAccounts: {name: string; accountId: string; publicKey: string; privateKey?: string}[] =
          systemAccounts.map(account => ({
            name: account.name,
            accountId: account.accountId.toString(),
            publicKey: account.publicKey.toString(),
            privateKey: account.privateKey,
          }));

        // Create the structured output with both systemAccounts and createdAccounts
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
    let remoteConfigLoaded: boolean = false;
    let oneShotLease: Lock | undefined;

    // don't make remote config call if deployment is not set or it will fail
    let hasExplorers: boolean = false;
    let hasRelays: boolean = false;

    const taskArray: SoloListrTask<AnyListrContext>[] = [
      {
        title: 'Initialize',
        task: async (context_, task): Promise<void> => {
          this.configManager.update(argv);
          this.oneShotState.activate();

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

          if (!config.deployment) {
            const deployments: any = this.localConfig.configuration.deployments;
            if (deployments.length === 0) {
              this.logger.showUser('No deployments found in local config, have they already been deleted?');
              config.skipAll = true;
              return;
            }

            if (deployments.length > 1) {
              const selectedDeployment: string = (await task.prompt(ListrInquirerPromptAdapter).run(selectPrompt, {
                message: 'Select deployment to destroy',
                choices: deployments.map((deployment: any): {name: string; value: string} => {
                  const clusterNames: string[] = (deployment.clusters ?? [])
                    .map((cluster: any): string => cluster?.toString())
                    .filter(Boolean);
                  return {
                    name: `${deployment.name} (ns: ${deployment.namespace}, clusters: ${clusterNames || 'unknown'})`,
                    value: deployment.name,
                  };
                }),
              })) as string;

              if (!selectedDeployment) {
                throw new SoloError('Deployment selection cannot be empty');
              }

              config.deployment = selectedDeployment;
            } else {
              // Only one deployment exists, use it directly
              const deployment: any = deployments.get(0);
              if (!deployment || !deployment.name) {
                throw new SoloError('Invalid deployment configuration: deployment name is missing');
              }
              config.deployment = deployment.name;
            }

            this.configManager.setFlag(flags.deployment, config.deployment);
          }

          const selectedDeployment: any = this.localConfig.configuration.deployments.find(
            (deployment: any): boolean => deployment.name === config.deployment,
          );
          if (selectedDeployment?.clusters?.length) {
            const firstCluster: any = selectedDeployment.clusters?.find(
              (cluster: any): boolean => cluster !== null && cluster !== undefined,
            );
            if (firstCluster) {
              config.clusterRef ??= firstCluster.toString();
            }
          }

          config.clusterRef ??= this.localConfig.configuration.clusterRefs.keys().next().value;

          config.context ??= this.localConfig.configuration.clusterRefs.get(config.clusterRef)?.toString();

          remoteConfigLoaded = await this.loadRemoteConfigOrWarn(argv);
          try {
            config.namespace ??= await resolveNamespaceFromDeployment(this.localConfig, this.configManager, task);
          } catch (error) {
            if (error.message?.includes('not found in local config')) {
              this.logger.showUser(
                `Deployment: ${config.deployment}, not found in local config, has it already been deleted?`,
              );
              config.skipAll = true;
              return;
            } else {
              throw error;
            }
          }

          try {
            const kubeContextConnectionSuccessful: boolean = await this.k8Factory
              .default()
              .contexts()
              .testContextConnection(config.context);
            if (!kubeContextConnectionSuccessful) {
              config.skipAll = true;
              return;
            }
          } catch (error) {
            this.logger.error(`Error connecting to cluster with context ${config.context}:`, error);
          }
          try {
            if (config.deployment && config.namespace && config.context) {
              await this.remoteConfig.loadAndValidate(argv);
              config.skipAll = false;
            } else {
              config.skipAll = true;
              return;
            }
          } catch (error) {
            if (
              error instanceof ResourceNotFoundError ||
              error.cause instanceof ResourceNotFoundError ||
              error instanceof NoKubeConfigContextError ||
              error.cause instanceof NoKubeConfigContextError
            ) {
              this.logger.showUser(
                'Remote config not found. This may indicate that the deployment has already been deleted or there is an issue with the cluster. Proceeding with best effort cleanup.',
              );
              this.logger.error('Error loading remote config:', error);
              config.skipAll = true;
              return;
            } else {
              throw error;
            }
          }
          hasExplorers = this.remoteConfig.configuration.components.state.explorers.length > 0;
          hasRelays = this.remoteConfig.configuration.components.state.relayNodes.length > 0;
        },
      },
      {
        title: 'Acquire deployment lock',
        task: async (context_, task): Promise<Listr<AnyListrContext>> => {
          oneShotLease = await this.leaseManager.create();
          return ListrLock.newAcquireLockTask(oneShotLease, task);
        },
        skip: (): boolean => config.skipAll,
      },
      {
        title: 'Destroy extended setup',
        task: async (
          context_: OneShotSingleDeployContext,
          task: SoloListrTaskWrapper<OneShotSingleDeployContext>,
        ): Promise<Listr<OneShotSingleDeployContext, ListrRendererValue, ListrRendererValue>> => {
          const subTasks: SoloListrTask<OneShotSingleDeployContext>[] = [
            invokeSoloCommand(
              `solo ${ExplorerCommandDefinition.DESTROY_COMMAND}`,
              ExplorerCommandDefinition.DESTROY_COMMAND,
              (): string[] => {
                const argv: string[] = newArgv();
                argv.push(
                  ...ExplorerCommandDefinition.DESTROY_COMMAND.split(' '),
                  optionFromFlag(flags.clusterRef),
                  config.clusterRef,
                  optionFromFlag(flags.deployment),
                  config.deployment,
                  optionFromFlag(flags.quiet),
                  optionFromFlag(flags.force),
                );
                return argvPushGlobalFlags(argv);
              },
              this.taskList,
              (): boolean => {
                return !hasExplorers;
              },
            ),
            invokeSoloCommand(
              `solo ${RelayCommandDefinition.DESTROY_COMMAND}`,
              RelayCommandDefinition.DESTROY_COMMAND,
              (): string[] => {
                const argv: string[] = newArgv();
                argv.push(
                  ...RelayCommandDefinition.DESTROY_COMMAND.split(' '),
                  optionFromFlag(flags.clusterRef),
                  config.clusterRef,
                  optionFromFlag(flags.deployment),
                  config.deployment,
                  optionFromFlag(flags.nodeAliasesUnparsed),
                  'node1',
                  optionFromFlag(flags.quiet),
                );
                return argvPushGlobalFlags(argv);
              },
              this.taskList,
              (): boolean => {
                return !hasRelays;
              },
            ),
          ];

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            exitOnError: false,
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        },
        skip: (): boolean => {
          if (config.skipAll || !config.deployment) {
            return true;
          }
          return !hasExplorers && !hasRelays;
        },
      },
      invokeSoloCommand(
        `solo ${MirrorCommandDefinition.DESTROY_COMMAND}`,
        MirrorCommandDefinition.DESTROY_COMMAND,
        (): string[] => {
          const argv: string[] = newArgv();
          argv.push(
            ...MirrorCommandDefinition.DESTROY_COMMAND.split(' '),
            optionFromFlag(flags.clusterRef),
            config.clusterRef,
            optionFromFlag(flags.deployment),
            config.deployment,
            optionFromFlag(flags.quiet),
            optionFromFlag(flags.force),
            optionFromFlag(flags.devMode),
          );
          return argvPushGlobalFlags(argv);
        },
        this.taskList,
        (): boolean =>
          config.skipAll ||
          !config.deployment ||
          this.remoteConfig.configuration.components.state.mirrorNodes.length === 0,
      ),
      invokeSoloCommand(
        `solo ${BlockCommandDefinition.DESTROY_COMMAND}`,
        BlockCommandDefinition.DESTROY_COMMAND,
        (): string[] => {
          const argv: string[] = newArgv();
          argv.push(
            ...BlockCommandDefinition.DESTROY_COMMAND.split(' '),
            optionFromFlag(Flags.deployment),
            config.deployment,
            optionFromFlag(flags.clusterRef),
            config.clusterRef,
            optionFromFlag(flags.quiet),
          );
          return argvPushGlobalFlags(argv);
        },
        this.taskList,
        (): boolean =>
          config.skipAll ||
          !config.deployment ||
          constants.ONE_SHOT_WITH_BLOCK_NODE.toLowerCase() !== 'true' ||
          (remoteConfigLoaded && this.remoteConfig.configuration.components.state.blockNodes.length === 0),
      ),
      invokeSoloCommand(
        `solo ${ConsensusCommandDefinition.DESTROY_COMMAND}`,
        ConsensusCommandDefinition.DESTROY_COMMAND,
        (): string[] => {
          const argv: string[] = newArgv();
          argv.push(
            ...ConsensusCommandDefinition.DESTROY_COMMAND.split(' '),
            optionFromFlag(flags.deployment),
            config.deployment,
            optionFromFlag(flags.quiet),
            optionFromFlag(flags.force),
            optionFromFlag(flags.deletePvcs),
            optionFromFlag(flags.deleteSecrets),
            optionFromFlag(flags.enableTimeout),
          );
          return argvPushGlobalFlags(argv);
        },
        this.taskList,
        (): boolean => config.skipAll || !config.deployment,
      ),
      invokeSoloCommand(
        `solo ${ClusterReferenceCommandDefinition.RESET_COMMAND}`,
        ClusterReferenceCommandDefinition.RESET_COMMAND,
        (): string[] => {
          const argv: string[] = newArgv();
          argv.push(
            ...ClusterReferenceCommandDefinition.RESET_COMMAND.split(' '),
            optionFromFlag(flags.clusterRef),
            config.clusterRef,
            optionFromFlag(flags.quiet),
            optionFromFlag(flags.force),
          );
          return argvPushGlobalFlags(argv);
        },
        this.taskList,
        (): boolean => config.skipAll || !config.deployment,
      ),
      invokeSoloCommand(
        `solo ${ClusterReferenceCommandDefinition.DISCONNECT_COMMAND}`,
        ClusterReferenceCommandDefinition.DISCONNECT_COMMAND,
        (): string[] => {
          const argv: string[] = newArgv();
          argv.push(
            ...ClusterReferenceCommandDefinition.DISCONNECT_COMMAND.split(' '),
            optionFromFlag(flags.clusterRef),
            config.clusterRef,
            optionFromFlag(flags.quiet),
          );
          return argvPushGlobalFlags(argv);
        },
        this.taskList,
        (): boolean => config.skipAll || !config.deployment,
      ),
      invokeSoloCommand(
        `solo ${DeploymentCommandDefinition.DELETE_COMMAND}`,
        DeploymentCommandDefinition.DELETE_COMMAND,
        (): string[] => {
          const argv: string[] = newArgv();
          argv.push(
            ...DeploymentCommandDefinition.DELETE_COMMAND.split(' '),
            optionFromFlag(flags.deployment),
            config.deployment,
            optionFromFlag(flags.quiet),
          );
          return argvPushGlobalFlags(argv);
        },
        this.taskList,
        (): boolean => !config.deployment,
      ),
      {title: 'Finish', task: async (): Promise<void> => {}},
    ];

    const tasks: any = this.taskList.newOneShotSingleDestroyTaskList(
      taskArray,
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error destroying Solo in one-shot mode: ${error.message}`, error);
    } finally {
      this.oneShotState.deactivate();
      const cleanupPromises: Promise<void>[] = [];
      if (oneShotLease) {
        cleanupPromises.push(
          oneShotLease.release(true).catch((error): void => {
            this.logger.error('Error releasing one-shot lease:', error);
          }),
        );
      }
      cleanupPromises.push(
        this.taskList
          .callCloseFunctions()
          .then()
          .catch((error): void => this.logger.error('Error during closing task list:', error)),
      );
      await Promise.all(cleanupPromises);
    }

    return true;
  }

  public async info(_argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<OneShotInfoContext> = new Listr(
      [
        {
          title: 'Check for cached deployment',
          task: async (context_): Promise<void> => {
            const deploymentFromFlag: DeploymentName = this.configManager.getFlag(flags.deployment);
            if (deploymentFromFlag) {
              context_.deploymentName = deploymentFromFlag;
              this.logger.showUser(chalk.cyan(`\nDeployment Name: ${chalk.bold(deploymentFromFlag)} (from flag)`));
              return;
            }

            const cacheFile: string = PathEx.join(constants.SOLO_CACHE_DIR, 'last-one-shot-deployment.txt');

            if (fs.existsSync(cacheFile)) {
              const deploymentName: string = fs.readFileSync(cacheFile, 'utf8').trim();
              if (deploymentName) {
                context_.deploymentName = deploymentName;
                this.logger.showUser(chalk.cyan(`\nDeployment Name: ${chalk.bold(deploymentName)} (from cache)`));
                return;
              }
            }

            await this.localConfig.load();
            const deployments: MutableFacadeArray<Deployment, DeploymentSchema> =
              this.localConfig.configuration.deployments;
            if (deployments.length === 1) {
              context_.deploymentName = deployments.get(0).name;
              this.logger.showUser(
                chalk.cyan(`\nDeployment Name: ${chalk.bold(context_.deploymentName)} (single local deployment)`),
              );
              return;
            }

            if (deployments.length > 1) {
              const deploymentNames: string = deployments.map((d): string => d.name).join(', ');
              throw new SoloError(
                'No cached deployment found and multiple local deployments exist.\n' +
                  `Please specify ${optionFromFlag(flags.deployment)}.\n` +
                  `Available deployments: ${deploymentNames}`,
              );
            }

            throw new SoloError(
              'No cached deployment found. Please run a one-shot deployment first or pass ' +
                `${optionFromFlag(flags.deployment)}.\n` +
                `Expected cache file: ${cacheFile}`,
            );
          },
        },
        {
          title: 'Load local configuration',
          task: async (context_): Promise<void> => {
            await this.localConfig.load();

            const deployment: Deployment = this.localConfig.configuration.deployments.find(
              (d): boolean => d.name === context_.deploymentName,
            );

            if (!deployment) {
              this.logger.showUser(
                chalk.yellow(
                  `\n⚠️  Deployment '${context_.deploymentName}' not found in local configuration.\n` +
                    'This may be a deployment that was created but not properly registered.',
                ),
              );
              return;
            }

            context_.deployment = deployment;
            this.logger.showUser(chalk.cyan(`\nNamespace: ${chalk.bold(deployment.namespace)}`));

            if (deployment.clusters && deployment.clusters.length > 0) {
              const clusterNames: string = deployment.clusters.map((c): string => c.toString()).join(', ');
              this.logger.showUser(chalk.cyan(`Clusters: ${chalk.bold(clusterNames)}`));
            }
          },
        },
        {
          title: 'Check cluster connectivity',
          task: async (context_, task): Promise<void> => {
            if (!context_.deployment) {
              task.skip('No deployment configuration found');
              return;
            }

            const deployment: Deployment = context_.deployment;
            if (!deployment.clusters || deployment.clusters.length === 0) {
              this.logger.showUser(chalk.yellow('\n⚠️  No clusters attached to this deployment.'));
              return;
            }

            const clusterReference: string = deployment.clusters.get(0).toString();
            const clusterContext: StringFacade | undefined =
              this.localConfig.configuration.clusterRefs.get(clusterReference);

            if (!clusterContext) {
              this.logger.showUser(
                chalk.yellow(`\n⚠️  Cluster reference '${clusterReference}' not found in configuration.`),
              );
              return;
            }

            try {
              this.k8Factory.default().contexts().updateCurrent(clusterContext.toString());
              const namespaces: NamespaceName[] = await this.k8Factory.default().namespaces().list();
              const targetNamespace: NamespaceName = namespaces.find((ns): boolean => ns.name === deployment.namespace);

              if (!targetNamespace) {
                this.logger.showUser(
                  chalk.yellow(
                    `\n⚠️  Namespace '${deployment.namespace}' not found in cluster '${clusterReference}'.` +
                      '\nThe deployment may have been destroyed or is not accessible.',
                  ),
                );
                return;
              }

              context_.clusterConnected = true;
            } catch (error) {
              this.logger.showUser(
                chalk.yellow(`\n⚠️  Unable to connect to cluster '${clusterReference}'.\n` + `Error: ${error.message}`),
              );
            }
          },
        },
        {
          title: 'Fetch deployment state',
          task: async (context_, task): Promise<void> => {
            if (!context_.clusterConnected || !context_.deployment) {
              task.skip('Cluster not accessible or no deployment configuration');
              return;
            }

            const deployment: Deployment = context_.deployment;

            try {
              const namespaceName: NamespaceName = NamespaceName.of(deployment.namespace);
              const configMaps: ConfigMap[] = await this.k8Factory.default().configMaps().list(namespaceName, []);

              const remoteConfigMap: Optional<ConfigMap> = configMaps.find(
                (cm): boolean => cm.name === constants.SOLO_REMOTE_CONFIGMAP_NAME,
              );

              if (!remoteConfigMap) {
                this.logger.showUser(
                  chalk.yellow(
                    `\n⚠️  Remote configuration not found in namespace '${deployment.namespace}'.` +
                      '\nThe deployment may have been partially destroyed.',
                  ),
                );
                return;
              }

              context_.remoteConfig = yaml.parse(remoteConfigMap.data[constants.SOLO_REMOTE_CONFIGMAP_DATA_KEY]);
            } catch (error) {
              this.logger.showUser(chalk.yellow(`\n⚠️  Unable to fetch remote configuration: ${error.message}`));
            }
          },
        },
        {
          title: 'Display deployment information',
          task: async (context_): Promise<void> => {
            this.logger.showUser(chalk.cyan('\n=== Deployment Components ==='));

            const versions: ApplicationVersionsSchema = context_.remoteConfig.versions;

            // Show versions
            this.logger.showUser(chalk.cyan('\nVersions:'));
            this.logger.showUser(`  Solo Chart Version: ${chalk.bold()}`);
            this.logger.showUser(`  Consensus Node Version: ${chalk.bold(versions.consensusNode?.toString())}`);
            this.logger.showUser(`  Mirror Node Version: ${chalk.bold(versions.mirrorNodeChart?.toString())}`);
            this.logger.showUser(`  Explorer Version: ${chalk.bold(versions.explorerChart?.toString())}`);
            this.logger.showUser(`  JSON RPC Relay Version: ${chalk.bold(versions.jsonRpcRelayChart?.toString())}`);
            this.logger.showUser(`  Block Node Version: ${chalk.bold(versions.blockNodeChart?.toString())}`);

            if (context_.remoteConfig) {
              const components: DeploymentStateSchema = context_.remoteConfig.state;

              if (components) {
                this.logger.showUser(chalk.cyan('\nDeployed Components:'));

                if (components.consensusNodes && components.consensusNodes.length > 0) {
                  const nodeNames: string = components.consensusNodes
                    .map((n): NodeAlias => Templates.renderNodeAliasFromNumber(n.metadata.id))
                    .join(', ');

                  this.logger.showUser(
                    `  ${chalk.green('✓')} Consensus Nodes: ${chalk.bold(components.consensusNodes.length)} (${nodeNames})`,
                  );
                }

                if (components.mirrorNodes && components.mirrorNodes.length > 0) {
                  this.logger.showUser(
                    `  ${chalk.green('✓')} Mirror Nodes: ${chalk.bold(components.mirrorNodes.length)}`,
                  );
                }

                if (components.blockNodes && components.blockNodes.length > 0) {
                  this.logger.showUser(
                    `  ${chalk.green('✓')} Block Nodes: ${chalk.bold(components.blockNodes.length)}`,
                  );
                }

                if (components.relayNodes && components.relayNodes.length > 0) {
                  this.logger.showUser(
                    `  ${chalk.green('✓')} Relay Nodes: ${chalk.bold(components.relayNodes.length)}`,
                  );
                }

                if (components.explorers && components.explorers.length > 0) {
                  this.logger.showUser(`  ${chalk.green('✓')} Explorers: ${chalk.bold(components.explorers.length)}`);
                }

                if (components.postgres && components.postgres.length > 0) {
                  this.logger.showUser(`  ${chalk.green('✓')} Postgres: ${chalk.bold(components.postgres.length)}`);
                }

                if (components.redis && components.redis.length > 0) {
                  this.logger.showUser(`  ${chalk.green('✓')} Redis: ${chalk.bold(components.redis.length)}`);
                }
              }
            } else {
              this.logger.showUser(
                chalk.yellow('\n⚠️  Remote configuration not available. Cannot display deployed components.'),
              );
            }

            // Show information about where files are stored
            const outputDirectory: string = this.getOneShotOutputDirectory(context_.deploymentName);

            this.logger.showUser(chalk.cyan('\n=== Deployment Files ==='));

            if (fs.existsSync(outputDirectory)) {
              this.logger.showUser(`Output directory: ${chalk.bold(outputDirectory)}`);

              const notesFile: string = PathEx.join(outputDirectory, 'notes');
              const versionsFile: string = PathEx.join(outputDirectory, 'versions');
              const forwardsFile: string = PathEx.join(outputDirectory, 'forwards');
              const accountsFile: string = PathEx.join(outputDirectory, 'accounts.json');

              if (fs.existsSync(notesFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Notes: ${notesFile}`);
              }
              if (fs.existsSync(versionsFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Versions: ${versionsFile}`);
              }
              if (fs.existsSync(forwardsFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Port forwards: ${forwardsFile}`);
              }
              if (fs.existsSync(accountsFile)) {
                this.logger.showUser(`  ${chalk.green('✓')} Accounts: ${accountsFile}`);
              }
            } else {
              this.logger.showUser(chalk.yellow(`\n⚠️  Output directory not found: ${outputDirectory}`));
            }

            this.logger.showUser(chalk.green('\n✓ Deployment information retrieved successfully.\n'));
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
    } catch (error) {
      throw new SoloError(`Error retrieving deployment information: ${error.message}`, error);
    }

    return true;
  }

  public async close(): Promise<void> {} // no-op

  private resolveOneShotComponentVersions(useEdge: boolean): OneShotVersionsObject {
    return useEdge
      ? {
          soloChart: version.SOLO_CHART_EDGE_VERSION,
          consensus: version.HEDERA_PLATFORM_EDGE_VERSION,
          mirror: version.MIRROR_NODE_EDGE_VERSION,
          explorer: version.EXPLORER_EDGE_VERSION,
          relay: version.HEDERA_JSON_RPC_RELAY_EDGE_VERSION,
          blockNode: version.BLOCK_NODE_EDGE_VERSION,
        }
      : {
          soloChart: version.SOLO_CHART_VERSION,
          consensus: version.HEDERA_PLATFORM_VERSION,
          mirror: version.MIRROR_NODE_VERSION,
          explorer: version.EXPLORER_VERSION,
          relay: version.HEDERA_JSON_RPC_RELAY_VERSION,
          blockNode: version.BLOCK_NODE_VERSION,
        };
  }
}
