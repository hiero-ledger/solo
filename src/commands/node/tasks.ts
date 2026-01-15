// SPDX-License-Identifier: Apache-2.0

import {type AccountManager} from '../../core/account-manager.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {type KeyManager} from '../../core/key-manager.js';
import {type ProfileManager} from '../../core/profile-manager.js';
import {type PlatformInstaller} from '../../core/platform-installer.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type ChartManager} from '../../core/chart-manager.js';
import {type CertificateManager} from '../../core/certificate-manager.js';
import {Zippy} from '../../core/zippy.js';
import * as constants from '../../core/constants.js';
import {DEFAULT_NETWORK_NODE_NAME, HEDERA_NODE_DEFAULT_STAKE_AMOUNT} from '../../core/constants.js';
import {Templates} from '../../core/templates.js';
import {
  AccountBalance,
  AccountBalanceQuery,
  AccountId,
  AccountUpdateTransaction,
  type Client,
  FileAppendTransaction,
  FileId,
  FileUpdateTransaction,
  FreezeTransaction,
  FreezeType,
  Long,
  NodeCreateTransaction,
  NodeDeleteTransaction,
  NodeUpdateTransaction,
  PrivateKey,
  ServiceEndpoint,
  Status,
  Timestamp,
  TransactionReceipt,
  TransactionResponse,
} from '@hiero-ledger/sdk';
import {SoloError} from '../../core/errors/solo-error.js';
import {MissingArgumentError} from '../../core/errors/missing-argument-error.js';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execSync} from 'node:child_process';
import * as helpers from '../../core/helpers.js';
import {
  addDebugOptions,
  entityId,
  extractContextFromConsensusNodes,
  prepareEndpoints,
  renameAndCopyFile,
  showVersionBanner,
  sleep,
  splitFlagInput,
} from '../../core/helpers.js';
import chalk from 'chalk';
import {Flags as flags} from '../flags.js';
import {ListrInquirerPromptAdapter} from '@listr2/prompt-adapter-inquirer';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {
  type AnyListrContext,
  type AnyObject,
  type ArgvStruct,
  type ConfigBuilder,
  type IP,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
  type SkipCheck,
} from '../../types/aliases.js';
import {PodName} from '../../integration/kube/resources/pod/pod-name.js';
import {NodeStatusCodes, NodeStatusEnums, NodeSubcommandType} from '../../core/enumerations.js';
import {type Lock} from '../../core/lock/lock.js';
import {ListrLock} from '../../core/lock/listr-lock.js';
import {Duration} from '../../core/time/duration.js';
import {type NodeAddConfigClass} from './config-interfaces/node-add-config-class.js';
import {GenesisNetworkDataConstructor} from '../../core/genesis-network-models/genesis-network-data-constructor.js';
import {NodeOverridesModel} from '../../core/node-overrides-model.js';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {PodReference} from '../../integration/kube/resources/pod/pod-reference.js';
import {ContainerReference} from '../../integration/kube/resources/container/container-reference.js';
import {NetworkNodes} from '../../core/network-nodes.js';
import {container, inject, injectable} from 'tsyringe-neo';
import {
  type AccountIdWithKeyPairObject,
  type ClusterReferenceName,
  type ClusterReferences,
  type ComponentData,
  type ComponentDisplayName,
  type ComponentId,
  type Context,
  type DeploymentName,
  type Optional,
  type SoloListr,
  type SoloListrTask,
  type SoloListrTaskWrapper,
} from '../../types/index.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ConsensusNode} from '../../core/model/consensus-node.js';
import {type K8} from '../../integration/kube/k8.js';
import {Base64} from 'js-base64';
import {SecretType} from '../../integration/kube/resources/secret/secret-type.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {BaseCommand} from '../base.js';
import {HEDERA_PLATFORM_VERSION, MINIMUM_HIERO_PLATFORM_VERSION_FOR_GRPC_WEB_ENDPOINTS} from '../../../version.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type NodeDestroyConfigClass} from './config-interfaces/node-destroy-config-class.js';
import {type NodeRefreshConfigClass} from './config-interfaces/node-refresh-config-class.js';
import {type NodeUpdateConfigClass} from './config-interfaces/node-update-config-class.js';
import {type NodeAddContext} from './config-interfaces/node-add-context.js';
import {type NodeDestroyContext} from './config-interfaces/node-destroy-context.js';
import {type NodeUpdateContext} from './config-interfaces/node-update-context.js';
import {type NodeStatesContext} from './config-interfaces/node-states-context.js';
import {type NodeUpgradeContext} from './config-interfaces/node-upgrade-context.js';
import {type NodeRefreshContext} from './config-interfaces/node-refresh-context.js';
import {type NodeStopContext} from './config-interfaces/node-stop-context.js';
import {type NodeFreezeContext} from './config-interfaces/node-freeze-context.js';
import {type NodeStartContext} from './config-interfaces/node-start-context.js';
import {type NodeRestartContext} from './config-interfaces/node-restart-context.js';
import {type NodeSetupContext} from './config-interfaces/node-setup-context.js';
import {type NodeKeysContext} from './config-interfaces/node-keys-context.js';
import {type NodeKeysConfigClass} from './config-interfaces/node-keys-config-class.js';
import {type NodeStartConfigClass} from './config-interfaces/node-start-config-class.js';
import {type CheckedNodesConfigClass, type CheckedNodesContext} from './config-interfaces/node-common-config-class.js';
import {type NetworkNodeServices} from '../../core/network-node-services.js';
import {ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';
import {DeploymentPhase} from '../../data/schema/model/remote/deployment-phase.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type ComponentFactoryApi} from '../../core/config/remote/api/component-factory-api.js';
import {type LocalConfigRuntimeState} from '../../business/runtime-state/config/local/local-config-runtime-state.js';
import {ClusterSchema} from '../../data/schema/model/common/cluster-schema.js';
import {LockManager} from '../../core/lock/lock-manager.js';
import {type NodeServiceMapping} from '../../types/mappings/node-service-mapping.js';
import {lt, SemVer} from 'semver';
import {Pod} from '../../integration/kube/resources/pod/pod.js';
import {type Container} from '../../integration/kube/resources/container/container.js';
import {Version} from '../../business/utils/version.js';
import {DeploymentStateSchema} from '../../data/schema/model/remote/deployment-state-schema.js';
import {type BaseStateSchema} from '../../data/schema/model/remote/state/base-state-schema.js';
import {ComponentStateMetadataSchema} from '../../data/schema/model/remote/state/component-state-metadata-schema.js';
import net from 'node:net';
import {type NodeConnectionsContext} from './config-interfaces/node-connections-context.js';
import {TDirectoryData} from '../../integration/kube/t-directory-data.js';
import {Service} from '../../integration/kube/resources/service/service.js';
import {Address} from '../../business/address/address.js';
import {Contexts} from '../../integration/kube/resources/context/contexts.js';

const {gray, cyan, red, green, yellow} = chalk;

export type LeaseWrapper = {lease: Lock};

@injectable()
export class NodeCommandTasks {
  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
    @inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager,
    @inject(InjectTokens.ConfigManager) private readonly configManager: ConfigManager,
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.PlatformInstaller) private readonly platformInstaller: PlatformInstaller,
    @inject(InjectTokens.KeyManager) private readonly keyManager: KeyManager,
    @inject(InjectTokens.ProfileManager) private readonly profileManager: ProfileManager,
    @inject(InjectTokens.ChartManager) private readonly chartManager: ChartManager,
    @inject(InjectTokens.CertificateManager) private readonly certificateManager: CertificateManager,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfig: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig: LocalConfigRuntimeState,
    @inject(InjectTokens.ComponentFactory) private readonly componentFactory: ComponentFactoryApi,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.platformInstaller = patchInject(platformInstaller, InjectTokens.PlatformInstaller, this.constructor.name);
    this.keyManager = patchInject(keyManager, InjectTokens.KeyManager, this.constructor.name);
    this.profileManager = patchInject(profileManager, InjectTokens.ProfileManager, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.certificateManager = patchInject(certificateManager, InjectTokens.CertificateManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
  }

  private getFileUpgradeId(deploymentName: DeploymentName): FileId {
    const realm = this.localConfig.configuration.realmForDeployment(deploymentName);
    const shard = this.localConfig.configuration.shardForDeployment(deploymentName);
    return FileId.fromString(entityId(shard, realm, constants.UPGRADE_FILE_ID_NUM));
  }

  private async _prepareUpgradeZip(stagingDirectory: string, upgradeVersion: string): Promise<string> {
    // we build a mock upgrade.zip file as we really don't need to upgrade the network
    // also the platform zip file is ~80Mb in size requiring a lot of transactions since the max
    // transaction size is 6Kb and in practice we need to send the file as 4Kb chunks.
    // Note however that in DAB phase-2, we won't need to trigger this fake upgrade process
    const zipper = new Zippy(this.logger);
    const upgradeConfigDirectory = PathEx.join(stagingDirectory, 'mock-upgrade', 'data', 'config');
    if (!fs.existsSync(upgradeConfigDirectory)) {
      fs.mkdirSync(upgradeConfigDirectory, {recursive: true});
    }

    // bump field hedera.config.version or use the version passed in
    const fileBytes = fs.readFileSync(PathEx.joinWithRealPath(stagingDirectory, 'templates', 'application.properties'));
    const lines = fileBytes.toString().split('\n');
    const newLines = [];
    for (let line of lines) {
      line = line.trim();
      const parts = line.split('=');
      if (parts.length === 2) {
        if (parts[0] === 'hedera.config.version') {
          const version: string = upgradeVersion ?? String(Number.parseInt(parts[1]) + 1);
          line = `hedera.config.version=${version}`;
        }
        newLines.push(line);
      }
    }
    fs.writeFileSync(PathEx.join(upgradeConfigDirectory, 'application.properties'), newLines.join('\n'));

    return await zipper.zip(
      PathEx.join(stagingDirectory, 'mock-upgrade'),
      PathEx.join(stagingDirectory, 'mock-upgrade.zip'),
    );
  }

  private async _uploadUpgradeZip(
    upgradeZipFile: string,
    nodeClient: Client,
    deploymentName: DeploymentName,
  ): Promise<string> {
    // get byte value of the zip file
    const zipBytes = fs.readFileSync(upgradeZipFile);
    const zipHash = crypto.createHash('sha384').update(zipBytes).digest('hex');
    this.logger.debug(
      `loaded upgrade zip file [ zipHash = ${zipHash} zipBytes.length = ${zipBytes.length}, zipPath = ${upgradeZipFile}]`,
    );

    // create a file upload transaction to upload file to the network
    try {
      let start = 0;

      while (start < zipBytes.length) {
        const zipBytesChunk = new Uint8Array(zipBytes.subarray(start, start + constants.UPGRADE_FILE_CHUNK_SIZE));
        let fileTransaction = null;

        fileTransaction =
          start === 0
            ? new FileUpdateTransaction().setFileId(this.getFileUpgradeId(deploymentName)).setContents(zipBytesChunk)
            : new FileAppendTransaction().setFileId(this.getFileUpgradeId(deploymentName)).setContents(zipBytesChunk);
        const resp = await fileTransaction.execute(nodeClient);
        const receipt = await resp.getReceipt(nodeClient);
        this.logger.debug(
          `updated file ${this.getFileUpgradeId(deploymentName)} [chunkSize= ${zipBytesChunk.length}, txReceipt = ${receipt.toString()}]`,
        );

        start += constants.UPGRADE_FILE_CHUNK_SIZE;
        this.logger.debug(`uploaded ${start} bytes of ${zipBytes.length} bytes`);
      }

      return zipHash;
    } catch (error) {
      throw new SoloError(`failed to upload build.zip file: ${error.message}`, error);
    }
  }

  private async copyLocalBuildPathToNode(
    k8: K8,
    podReference: PodReference,
    configManager: ConfigManager,
    localDataLibraryBuildPath: string,
  ): Promise<void> {
    const filterFunction = (path: string | string[]) => {
      return !(path.includes('data/keys') || path.includes('data/config'));
    };

    await k8
      .containers()
      .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
      .copyTo(localDataLibraryBuildPath, `${constants.HEDERA_HAPI_PATH}`, filterFunction);
    if (configManager.getFlag<string>(flags.appConfig)) {
      const testJsonFiles: string[] = configManager.getFlag<string>(flags.appConfig)!.split(',');
      for (const jsonFile of testJsonFiles) {
        if (fs.existsSync(jsonFile)) {
          await k8
            .containers()
            .readByRef(ContainerReference.of(podReference, constants.ROOT_CONTAINER))
            .copyTo(jsonFile, `${constants.HEDERA_HAPI_PATH}`);
        }
      }
    }
  }

  private _uploadPlatformSoftware(
    nodeAliases: NodeAliases,
    podReferences: Record<NodeAlias, PodReference>,
    task: SoloListrTaskWrapper<AnyListrContext>,
    localBuildPath: string,
    consensusNodes: ConsensusNode[],
    releaseTag: string,
  ): SoloListr<AnyListrContext> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];

    this.logger.debug('no need to fetch, use local build jar files');

    const buildPathMap = new Map<NodeAlias, string>();
    let defaultDataLibraryBuildPath: string;
    const parameterPairs = localBuildPath.split(',');
    for (const parameterPair of parameterPairs) {
      if (parameterPair.includes('=')) {
        const [nodeAlias, localDataLibraryBuildPath] = parameterPair.split('=');
        buildPathMap.set(nodeAlias as NodeAlias, localDataLibraryBuildPath);
      } else {
        defaultDataLibraryBuildPath = parameterPair;
      }
    }

    let localDataLibraryBuildPath: string;

    for (const nodeAlias of nodeAliases) {
      const podReference = podReferences[nodeAlias];
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      localDataLibraryBuildPath = buildPathMap.has(nodeAlias)
        ? buildPathMap.get(nodeAlias)
        : defaultDataLibraryBuildPath;

      if (!fs.existsSync(localDataLibraryBuildPath)) {
        throw new SoloError(`local build path does not exist: ${localDataLibraryBuildPath}`);
      }

      const self = this;

      const k8 = self.k8Factory.getK8(context);

      subTasks.push({
        title: `Copy local build to Node: ${chalk.yellow(nodeAlias)} from ${localDataLibraryBuildPath}`,
        task: async () => {
          const shellRunner = new ShellRunner();
          try {
            const retrievedReleaseTag = await shellRunner.run(
              `git -C ${localDataLibraryBuildPath} describe --tags --abbrev=0`,
            );
            const expectedReleaseTag = releaseTag ? releaseTag : HEDERA_PLATFORM_VERSION;
            if (retrievedReleaseTag.join('\n') !== expectedReleaseTag) {
              this.logger.showUser(
                chalk.cyan(
                  `Checkout version ${retrievedReleaseTag} does not match the release version ${expectedReleaseTag}`,
                ),
              );
            }
          } catch {
            // if we can't find the release tag in the local build path directory, we will skip the check and continue
            self.logger.warn('Could not find release tag in local build path directory');
            self.logger.showUser(
              chalk.yellowBright(
                'The release tag could not be verified, please ensure that the release tag passed on the command line ' +
                  'matches the release tag of the code in the local build path directory',
              ),
            );
          }

          // retry copying the build to the node to handle edge cases during performance testing
          let storedError: Error | null = null;
          let index = 0;
          for (; index < constants.LOCAL_BUILD_COPY_RETRY; index++) {
            storedError = null;
            try {
              // filter the data/config and data/keys to avoid failures due to config and secret mounts
              await self.copyLocalBuildPathToNode(k8, podReference, self.configManager, localDataLibraryBuildPath);
            } catch (error) {
              storedError = error;
            }
          }
          if (storedError) {
            throw new SoloError(`Error in copying local build to node: ${storedError.message}`, storedError);
          }
        },
      });
    }
    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: constants.NODE_COPY_CONCURRENT,
      rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
      fallbackRendererOptions: {
        timer: constants.LISTR_DEFAULT_RENDERER_TIMER_OPTION,
      },
    });
  }

  private _fetchPlatformSoftware(
    nodeAliases: NodeAliases,
    podReferences: Record<NodeAlias, PodReference>,
    releaseTag: string,
    task: SoloListrTaskWrapper<AnyListrContext>,
    platformInstaller: PlatformInstaller,
    consensusNodes: ConsensusNode[],
  ): SoloListr<AnyListrContext> {
    const subTasks: SoloListrTask<AnyListrContext>[] = [];
    for (const nodeAlias of nodeAliases) {
      const context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
      const podReference = podReferences[nodeAlias];
      subTasks.push({
        title: `Update node: ${chalk.yellow(nodeAlias)} [ platformVersion = ${releaseTag}, context = ${context} ]`,
        task: async () => await platformInstaller.fetchPlatform(podReference, releaseTag, context),
      });
    }

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true, // since we download in the container directly, we want this to be in parallel across all nodes
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  private _checkNodeActivenessTask(
    context_: AnyListrContext,
    task: SoloListrTaskWrapper<AnyListrContext>,
    nodeAliases: NodeAliases,
    status: NodeStatusCodes = NodeStatusCodes.ACTIVE,
  ): SoloListr<AnyListrContext> {
    const {
      config: {namespace},
    } = context_;

    const enableDebugger: boolean = context_.config.debugNodeAlias && status !== NodeStatusCodes.FREEZE_COMPLETE;
    const debugNodeAlias: NodeAlias | undefined = context_.config.debugNodeAlias;

    const subTasks = nodeAliases.map(nodeAlias => {
      const isDebugNode: boolean = debugNodeAlias === nodeAlias && status !== NodeStatusCodes.FREEZE_COMPLETE;
      const reminder: string = isDebugNode ? 'Please attach JVM debugger now.' : '';
      const title: string = `Check network pod: ${chalk.yellow(nodeAlias)} ${chalk.red(reminder)}`;
      const context: string = helpers.extractContextFromConsensusNodes(
        nodeAlias,
        this.remoteConfig.getConsensusNodes(),
      );

      return {
        title,
        task: async (context_: AnyListrContext, task: SoloListrTaskWrapper<AnyListrContext>): Promise<void> => {
          if (enableDebugger && isDebugNode) {
            await task.prompt(ListrInquirerPromptAdapter).run(confirmPrompt, {
              message: `JVM debugger setup for ${nodeAlias}. Continue when debugging is complete?`,
              default: false,
            });
          }

          context_.config.podRefs[nodeAlias] = await this._checkNetworkNodeActiveness(
            namespace,
            nodeAlias,
            task,
            title,
            status,
            undefined,
            undefined,
            undefined,
            context,
          );
        },
      };
    });

    return task.newListr(subTasks, {
      concurrent: !enableDebugger, // Run sequentially when debugging to avoid multiple prompts
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  private async _checkNetworkNodeActiveness(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    task: SoloListrTaskWrapper<AnyListrContext>,
    title: string,
    status: NodeStatusCodes = NodeStatusCodes.ACTIVE,
    maxAttempts: number = constants.NETWORK_NODE_ACTIVE_MAX_ATTEMPTS,
    delay: number = constants.NETWORK_NODE_ACTIVE_DELAY,
    timeout: number = constants.NETWORK_NODE_ACTIVE_TIMEOUT,
    context?: string,
  ): Promise<PodReference> {
    const podName: PodName = Templates.renderNetworkPodName(nodeAlias);
    const podReference: PodReference = PodReference.of(namespace, podName);
    task.title = `${title} - status ${chalk.yellow('STARTING')}, attempt ${chalk.blueBright(`0/${maxAttempts}`)}`;

    const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();

    if (typeof context !== 'string' || context.trim().length === 0) {
      context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);
    }

    let attempt: number = 0;
    let success: boolean = false;
    while (attempt < maxAttempts) {
      const controller: AbortController = new AbortController();

      const timeoutId: NodeJS.Timeout = setTimeout((): void => {
        task.title = `${title} - status ${chalk.yellow('TIMEOUT')}, attempt ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
        controller.abort();
      }, timeout);

      try {
        const response: string = await container.resolve(NetworkNodes).getNetworkNodePodStatus(podReference, context);

        if (!response) {
          task.title = `${title} - status ${chalk.yellow('UNKNOWN')}, attempt ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          clearTimeout(timeoutId);
          throw new SoloError('empty response'); // Guard
        }

        const statusLine: string = response
          .split('\n')
          .find((line): boolean => line.startsWith('platform_PlatformStatus'));

        if (!statusLine) {
          task.title = `${title} - status ${chalk.yellow('STARTING')}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          clearTimeout(timeoutId);
          throw new SoloError('missing status line'); // Guard
        }

        const statusNumber: number = Number.parseInt(statusLine.split(' ').pop());

        if (statusNumber === status) {
          task.title = `${title} - status ${chalk.green(NodeStatusEnums[status])}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          success = true;
          clearTimeout(timeoutId);
          break;
        } else if (statusNumber === NodeStatusCodes.CATASTROPHIC_FAILURE) {
          task.title = `${title} - status ${chalk.red('CATASTROPHIC_FAILURE')}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
          break;
        } else if (statusNumber) {
          task.title = `${title} - status ${chalk.yellow(NodeStatusEnums[statusNumber])}, attempt: ${chalk.blueBright(`${attempt}/${maxAttempts}`)}`;
        }
        clearTimeout(timeoutId);
      } catch (error) {
        this.logger.debug(
          `${title} : Error in checking node activeness: attempt: ${attempt}/${maxAttempts}: ${JSON.stringify(error)}`,
        );
      }

      attempt++;
      clearTimeout(timeoutId);
      await sleep(Duration.ofMillis(delay));
    }

    if (!success) {
      throw new SoloError(
        `node '${nodeAlias}' is not ${NodeStatusEnums[status]}` +
          `[ attempt = ${chalk.blueBright(`${attempt}/${maxAttempts}`)} ]`,
      );
    }

    await sleep(Duration.ofSeconds(2)); // delaying prevents - gRPC service error

    return podReference;
  }

  /** Return task for check if node proxies are ready */
  private _checkNodesProxiesTask(
    task: SoloListrTaskWrapper<{config: {consensusNodes: ConsensusNode[]; namespace: NamespaceName}}>,
    nodeAliases: NodeAliases,
  ): SoloListr<{config: {consensusNodes: ConsensusNode[]; namespace: NamespaceName}}> {
    const subTasks: SoloListrTask<{config: {consensusNodes: ConsensusNode[]; namespace: NamespaceName}}>[] = [];

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check proxy for node: ${chalk.yellow(nodeAlias)}`,
        task: async context_ => {
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);
          const k8 = this.k8Factory.getK8(context);
          await k8
            .pods()
            .waitForReadyStatus(
              context_.config.namespace,
              [`app=haproxy-${nodeAlias}`, 'solo.hedera.com/type=haproxy'],
              constants.NETWORK_PROXY_MAX_ATTEMPTS,
              constants.NETWORK_PROXY_DELAY,
            );
        },
      });
    }

    // set up the sub-tasks
    return task.newListr(subTasks, {
      concurrent: false,
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  /**
   * When generating multiple all aliases are read from config.nodeAliases,
   * When generating a single key the alias in config.nodeAlias is used
   */
  private _generateGossipKeys(generateMultiple: boolean): SoloListrTask<NodeKeysContext | NodeAddContext> {
    const self = this;

    return {
      title: 'Generate gossip keys',
      task: (context_, task) => {
        const config = context_.config;
        const nodeAliases = generateMultiple
          ? (config as NodeKeysConfigClass).nodeAliases
          : [(config as NodeAddConfigClass).nodeAlias];
        const subTasks = self.keyManager.taskGenerateGossipKeys(nodeAliases, config.keysDir, config.curDate);
        // set up the sub-tasks
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.DEFAULT);
      },
      skip: context_ => !context_.config.generateGossipKeys,
    };
  }

  /**
   * When generating multiple all aliases are read from config.nodeAliases,
   * When generating a single key the alias in config.nodeAlias is used
   */
  private _generateGrpcTlsKeys(generateMultiple: boolean): SoloListrTask<NodeKeysContext | NodeAddContext> {
    const self = this;
    return {
      title: 'Generate gRPC TLS Keys',
      task: (context_, task) => {
        const config = context_.config;
        const nodeAliases = generateMultiple
          ? (config as NodeKeysConfigClass).nodeAliases
          : [(config as NodeAddConfigClass).nodeAlias];
        const subTasks = self.keyManager.taskGenerateTLSKeys(nodeAliases, config.keysDir, config.curDate);
        // set up the sub-tasks
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
      skip: context_ => !context_.config.generateTlsKeys,
    };
  }

  public copyGrpcTlsCertificates(): SoloListrTask<NodeAddContext> {
    const self = this;
    return {
      title: 'Copy gRPC TLS Certificates',
      task: (context_, task) =>
        self.certificateManager.buildCopyTlsCertificatesTasks(
          task,
          context_.config.grpcTlsCertificatePath,
          context_.config.grpcWebTlsCertificatePath,
          context_.config.grpcTlsKeyPath,
          context_.config.grpcWebTlsKeyPath,
        ),
      skip: context_ => !context_.config.grpcTlsCertificatePath && !context_.config.grpcWebTlsCertificatePath,
    };
  }

  private async _addStake(
    namespace: NamespaceName,
    accountId: string,
    nodeAlias: NodeAlias,
    stakeAmount: number = HEDERA_NODE_DEFAULT_STAKE_AMOUNT,
  ): Promise<void> {
    try {
      const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
      await this.accountManager.loadNodeClient(
        namespace,
        this.remoteConfig.getClusterRefs(),
        deploymentName,
        this.configManager.getFlag<boolean>(flags.forcePortForward),
      );
      const client = this.accountManager._nodeClient;
      const treasuryKey: AccountIdWithKeyPairObject = await this.accountManager.getTreasuryAccountKeys(
        namespace,
        deploymentName,
      );

      const treasuryPrivateKey: PrivateKey = PrivateKey.fromStringED25519(treasuryKey.privateKey);
      const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deploymentName);
      client.setOperator(treasuryAccountId, treasuryPrivateKey);

      // check balance
      const treasuryBalance: AccountBalance = await new AccountBalanceQuery()
        .setAccountId(treasuryAccountId)
        .execute(client);

      this.logger.debug(`Account ${treasuryAccountId} balance: ${treasuryBalance.hbars}`);

      // get some initial balance
      await this.accountManager.transferAmount(treasuryAccountId, accountId, stakeAmount);

      // check balance
      const balance: AccountBalance = await new AccountBalanceQuery().setAccountId(accountId).execute(client);
      this.logger.debug(`Account ${accountId} balance: ${balance.hbars}`);

      // Create the transaction
      const transaction: AccountUpdateTransaction = new AccountUpdateTransaction()
        .setAccountId(accountId)
        .setStakedNodeId(Templates.nodeIdFromNodeAlias(nodeAlias))
        .freezeWith(client);

      // Sign the transaction with the account's private key
      const signTransaction: AccountUpdateTransaction = await transaction.sign(treasuryPrivateKey);

      const transactionResponse: TransactionResponse = await signTransaction.execute(client);

      const receipt: TransactionReceipt = await transactionResponse.getReceipt(client);

      this.logger.debug(`The transaction consensus status is ${receipt.status}`);
    } catch (error) {
      throw new SoloError(`Error in adding stake: ${error.message}`, error);
    }
  }

  public prepareUpgradeZip() {
    const self = this;
    return {
      title: 'Prepare upgrade zip file for node upgrade process',
      task: async context_ => {
        const config = context_.config;
        const {upgradeZipFile, deployment} = context_.config;
        if (upgradeZipFile) {
          context_.upgradeZipFile = upgradeZipFile;
          this.logger.debug(`Using upgrade zip file: ${context_.upgradeZipFile}`);
        } else {
          // download application.properties from the first node in the deployment
          const nodeAlias: NodeAlias = config.existingNodeAliases[0];

          const nodeFullyQualifiedPodName = Templates.renderNetworkPodName(nodeAlias);
          const podReference = PodReference.of(config.namespace, nodeFullyQualifiedPodName);
          const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);

          const context = helpers.extractContextFromConsensusNodes(
            (context_ as NodeUpdateContext | NodeDestroyContext).config.nodeAlias,
            context_.config.consensusNodes,
          );

          const templatesDirectory = PathEx.join(config.stagingDir, 'templates');
          fs.mkdirSync(templatesDirectory, {recursive: true});

          await this.k8Factory
            .getK8(context)
            .containers()
            .readByRef(containerReference)
            .copyFrom(`${constants.HEDERA_HAPI_PATH}/data/config/application.properties`, templatesDirectory);

          context_.upgradeZipFile = await self._prepareUpgradeZip(config.stagingDir, config.upgradeVersion);
        }
        context_.upgradeZipHash = await self._uploadUpgradeZip(context_.upgradeZipFile, config.nodeClient, deployment);
      },
    };
  }

  public loadAdminKey(): SoloListrTask<NodeUpdateContext | NodeUpgradeContext | NodeDestroyContext> {
    return {
      title: 'Load node admin key',
      task: async context_ => {
        const config = context_.config;
        if ((context_ as NodeUpdateContext | NodeDestroyContext).config.nodeAlias) {
          try {
            const context = helpers.extractContextFromConsensusNodes(
              (context_ as NodeUpdateContext | NodeDestroyContext).config.nodeAlias,
              context_.config.consensusNodes,
            );

            // load nodeAdminKey from k8s if exist
            const keyFromK8 = await this.k8Factory
              .getK8(context)
              .secrets()
              .read(
                config.namespace,
                Templates.renderNodeAdminKeyName((context_ as NodeUpdateContext | NodeDestroyContext).config.nodeAlias),
              );
            const privateKey: string = Base64.decode(keyFromK8.data.privateKey);
            config.adminKey = PrivateKey.fromStringED25519(privateKey);
          } catch (error) {
            this.logger.debug(`Error in loading node admin key: ${error.message}, use default key`);
            config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
          }
        } else {
          config.adminKey = PrivateKey.fromStringED25519(constants.GENESIS_KEY);
        }
      },
    };
  }

  public checkExistingNodesStakedAmount(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext
  > {
    const self = this;
    return {
      title: 'Check existing nodes staked amount',
      task: async context_ => {
        const config = context_.config;

        // Transfer some hbar to the node for staking purpose
        const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
        const accountMap = this.accountManager.getNodeAccountMap(config.existingNodeAliases, deploymentName);
        const treasuryAccountId = this.accountManager.getTreasuryAccountId(deploymentName);
        for (const nodeAlias of config.existingNodeAliases) {
          const accountId = accountMap.get(nodeAlias);
          await self.accountManager.transferAmount(treasuryAccountId, accountId, 1);
        }
      },
    };
  }

  public sendPrepareUpgradeTransaction(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext
  > {
    return {
      title: 'Send prepare upgrade transaction',
      task: async context_ => {
        const {upgradeZipHash} = context_;
        const {nodeClient, freezeAdminPrivateKey, deployment} = context_.config;
        try {
          const freezeAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);
          const treasuryAccountId: AccountId = this.accountManager.getTreasuryAccountId(deployment);

          // query the balance
          const balance = await new AccountBalanceQuery().setAccountId(freezeAccountId).execute(nodeClient);
          this.logger.debug(`Freeze admin account balance: ${balance.hbars}`);

          // transfer some tiny amount to the freeze admin account
          await this.accountManager.transferAmount(treasuryAccountId, freezeAccountId, 100_000);

          // set operator of freeze transaction as freeze admin account
          nodeClient.setOperator(freezeAccountId, freezeAdminPrivateKey);

          const prepareUpgradeTransaction: TransactionResponse = await new FreezeTransaction()
            .setFreezeType(FreezeType.PrepareUpgrade)
            .setFileId(this.getFileUpgradeId(deployment))
            .setFileHash(upgradeZipHash)
            .freezeWith(nodeClient)
            .execute(nodeClient);

          const prepareUpgradeReceipt: TransactionReceipt = await prepareUpgradeTransaction.getReceipt(nodeClient);

          this.logger.debug(
            `sent prepare upgrade transaction [id: ${prepareUpgradeTransaction.transactionId.toString()}]`,
            prepareUpgradeReceipt.status.toString(),
          );

          if (prepareUpgradeReceipt.status !== Status.Success) {
            throw new SoloError(`Prepare upgrade transaction failed: ${prepareUpgradeReceipt.status}`);
          }
        } catch (error) {
          throw new SoloError(`Error in prepare upgrade: ${error.message}`, error);
        }
      },
    };
  }

  public sendFreezeUpgradeTransaction(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext
  > {
    const self = this;
    return {
      title: 'Send freeze upgrade transaction',
      task: async context_ => {
        const {upgradeZipHash} = context_;
        const {freezeAdminPrivateKey, nodeClient, deployment} = context_.config;
        try {
          const futureDate = new Date();
          self.logger.debug(`Current time: ${futureDate}`);

          futureDate.setTime(futureDate.getTime() + 5000); // 5 seconds in the future
          self.logger.debug(`Freeze time: ${futureDate}`);

          const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);

          // query the balance
          const balance = await new AccountBalanceQuery().setAccountId(freezeAdminAccountId).execute(nodeClient);
          self.logger.debug(`Freeze admin account balance: ${balance.hbars}`);

          nodeClient.setOperator(freezeAdminAccountId, freezeAdminPrivateKey);
          const freezeUpgradeTx = await new FreezeTransaction()
            .setFreezeType(FreezeType.FreezeUpgrade)
            .setStartTimestamp(Timestamp.fromDate(futureDate))
            .setFileId(this.getFileUpgradeId(deployment))
            .setFileHash(upgradeZipHash)
            .freezeWith(nodeClient)
            .execute(nodeClient);

          const freezeUpgradeReceipt = await freezeUpgradeTx.getReceipt(nodeClient);
          self.logger.debug(
            `Upgrade frozen with transaction id: ${freezeUpgradeTx.transactionId.toString()}`,
            freezeUpgradeReceipt.status.toString(),
          );
        } catch (error) {
          throw new SoloError(`Error in freeze upgrade: ${error.message}`, error);
        }
      },
    };
  }

  public sendFreezeTransaction(): SoloListrTask<NodeFreezeContext> {
    const self = this;
    return {
      title: 'Send freeze only transaction',
      task: async context_ => {
        const {freezeAdminPrivateKey, deployment, namespace} = context_.config;
        try {
          const nodeClient = await this.accountManager.loadNodeClient(
            namespace,
            this.remoteConfig.getClusterRefs(),
            deployment,
          );
          const futureDate = new Date();
          self.logger.debug(`Current time: ${futureDate}`);

          futureDate.setTime(futureDate.getTime() + 5000); // 5 seconds in the future
          self.logger.debug(`Freeze time: ${futureDate}`);

          const freezeAdminAccountId: AccountId = this.accountManager.getFreezeAccountId(deployment);
          nodeClient.setOperator(freezeAdminAccountId, freezeAdminPrivateKey);
          const freezeOnlyTransaction = await new FreezeTransaction()
            .setFreezeType(FreezeType.FreezeOnly)
            .setStartTimestamp(Timestamp.fromDate(futureDate))
            .freezeWith(nodeClient)
            .execute(nodeClient);

          const freezeOnlyReceipt = await freezeOnlyTransaction.getReceipt(nodeClient);

          self.logger.debug(
            `sent prepare transaction [id: ${freezeOnlyTransaction.transactionId.toString()}]`,
            freezeOnlyReceipt.status.toString(),
          );
        } catch (error) {
          throw new SoloError(`Error in sending freeze transaction: ${error.message}`, error);
        }
      },
    };
  }

  /** Download generated config files and key files from the network node,
   *  This function should only be called when updating or destroying a node
   * */
  public downloadNodeGeneratedFilesForDynamicAddressBook(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext
  > {
    const self = this;
    return {
      title: 'Download generated files from an existing node',
      task: async ({
        config: {nodeAlias, existingNodeAliases, consensusNodes, stagingDir, keysDir, namespace},
      }): Promise<void> => {
        // don't try to download from the same node we are deleting, it won't work
        const targetNodeAlias: NodeAlias =
          nodeAlias === existingNodeAliases[0] && existingNodeAliases.length > 1
            ? existingNodeAliases[1]
            : existingNodeAliases[0];

        const nodeFullyQualifiedPodName: PodName = Templates.renderNetworkPodName(targetNodeAlias);
        const podReference: PodReference = PodReference.of(namespace, nodeFullyQualifiedPodName);
        const containerReference: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);

        const context: Context = helpers.extractContextFromConsensusNodes(targetNodeAlias, consensusNodes);

        const k8Container: Container = this.k8Factory.getK8(context).containers().readByRef(containerReference);

        // copy the config.txt file from the node1 upgrade directory
        await k8Container.copyFrom(`${constants.HEDERA_HAPI_PATH}/data/upgrade/current/config.txt`, stagingDir);

        // if directory data/upgrade/current/data/keys does not exist, then use data/upgrade/current
        let keyDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/keys`;

        if (!(await k8Container.hasDir(keyDirectory))) {
          keyDirectory = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`;
        }

        const signedKeyFiles: TDirectoryData[] = await k8Container
          .listDir(keyDirectory)
          .then((files: TDirectoryData[]): TDirectoryData[] =>
            files.filter((file): boolean => file.name.startsWith(constants.SIGNING_KEY_PREFIX)),
          );

        await k8Container.execContainer([
          'bash',
          '-c',
          `mkdir -p ${constants.HEDERA_HAPI_PATH}/data/keys_backup && cp -r ${keyDirectory} ${constants.HEDERA_HAPI_PATH}/data/keys_backup/`,
        ]);

        for (const signedKeyFile of signedKeyFiles) {
          await k8Container.copyFrom(`${keyDirectory}/${signedKeyFile.name}`, `${keysDir}`);
        }

        const applicationPropertiesSourceDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/config/application.properties`;

        await ((await k8Container.hasFile(applicationPropertiesSourceDirectory))
          ? k8Container.copyFrom(applicationPropertiesSourceDirectory, `${stagingDir}/templates`)
          : k8Container.copyFrom(
              `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/config/application.properties`,
              `${stagingDir}/templates`,
            ));
      },
    };
  }

  public downloadNodeUpgradeFiles(): SoloListrTask<NodeUpgradeContext> {
    const self = this;
    return {
      title: 'Download upgrade files from an existing node',
      task: async context_ => {
        const config = context_.config;

        const nodeAlias = context_.config.nodeAliases[0];
        const nodeFullyQualifiedPodName = Templates.renderNetworkPodName(nodeAlias);
        const podReference = PodReference.of(config.namespace, nodeFullyQualifiedPodName);
        const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

        // found all files under ${constants.HEDERA_HAPI_PATH}/data/upgrade/current/
        const upgradeDirectories = [
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current`,
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/apps`,
          `${constants.HEDERA_HAPI_PATH}/data/upgrade/current/data/libs`,
        ];
        const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        for (const upgradeDirectory of upgradeDirectories) {
          // check if directory upgradeDirectory exist in root container
          if (
            !(await self.k8Factory.getK8(context).containers().readByRef(containerReference).hasDir(upgradeDirectory))
          ) {
            continue;
          }
          const files = await self.k8Factory
            .getK8(context)
            .containers()
            .readByRef(containerReference)
            .listDir(upgradeDirectory);
          // iterate all files and copy them to the staging directory
          for (const file of files) {
            if (file.name.endsWith('.mf')) {
              continue;
            }
            if (file.directory) {
              continue;
            }
            this.logger.debug(`Copying file: ${file.name}`);
            await self.k8Factory
              .getK8(context)
              .containers()
              .readByRef(containerReference)
              .copyFrom(`${upgradeDirectory}/${file.name}`, `${config.stagingDir}`);
          }
        }
      },
    };
  }

  private taskCheckNetworkNodePods(
    context_: CheckedNodesContext,
    task: SoloListrTaskWrapper<CheckedNodesContext>,
    nodeAliases: NodeAliases,
    maxAttempts?: number,
  ) {
    context_.config.podRefs = {};
    const consensusNodes: ConsensusNode[] = context_.config.consensusNodes;

    const subTasks: SoloListrTask<CheckedNodesContext>[] = [];

    for (const nodeAlias of nodeAliases) {
      subTasks.push({
        title: `Check network pod: ${chalk.yellow(nodeAlias)}`,
        task: async ({config}): Promise<void> => {
          try {
            const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias, consensusNodes);

            config.podRefs[nodeAlias] = await this.checkNetworkNodePod(
              config.namespace,
              nodeAlias,
              maxAttempts,
              undefined,
              context,
            );
          } catch {
            config.skipStop = true;
          }
        },
      });
    }

    // setup the sub-tasks
    return task.newListr(subTasks, {
      concurrent: true,
      rendererOptions: {
        collapseSubtasks: false,
      },
    });
  }

  /** Check if the network node pod is running */
  private async checkNetworkNodePod(
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
    maxAttempts: number = constants.PODS_RUNNING_MAX_ATTEMPTS,
    delay: number = constants.PODS_RUNNING_DELAY,
    context?: Optional<string>,
  ): Promise<PodReference> {
    nodeAlias = nodeAlias.trim() as NodeAlias;
    const podName: PodName = Templates.renderNetworkPodName(nodeAlias);
    const podReference: PodReference = PodReference.of(namespace, podName);

    if (typeof context !== 'string' || context.trim().length === 0) {
      context = extractContextFromConsensusNodes(nodeAlias, this.remoteConfig.getConsensusNodes());
    }

    try {
      await this.k8Factory
        .getK8(context)
        .pods()
        .waitForRunningPhase(
          namespace,
          [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'],
          maxAttempts,
          delay,
        );

      return podReference;
    } catch (error) {
      throw new SoloError(`no pod found for nodeAlias: ${nodeAlias}`, error);
    }
  }

  public loadConfiguration(argv: ArgvStruct, leaseWrapper: LeaseWrapper, leaseManager: LockManager) {
    const self = this;
    return {
      title: 'Load configuration',
      task: async () => {
        await self.localConfig.load();
        await self.remoteConfig.loadAndValidate(argv);
        leaseWrapper.lease = await leaseManager.create();
      },
    };
  }

  public identifyExistingNodes(): SoloListrTask<CheckedNodesContext> {
    const self = this;
    return {
      title: 'Identify existing network nodes',
      task: async (context_, task) => {
        const config = context_.config;
        config.existingNodeAliases = [];
        const clusterReferences = this.remoteConfig.getClusterRefs();
        config.serviceMap = await self.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );
        for (const networkNodeServices of config.serviceMap.values()) {
          if (networkNodeServices.accountId === constants.IGNORED_NODE_ACCOUNT_ID) {
            continue;
          }
          config.existingNodeAliases.push(networkNodeServices.nodeAlias);
        }
        config.allNodeAliases = [...config.existingNodeAliases];
        return self.taskCheckNetworkNodePods(context_, task, config.existingNodeAliases);
      },
    };
  }

  public uploadStateFiles(skip: SkipCheck | boolean, stateFileDirectory?: string) {
    const self = this;
    return {
      title: 'Upload state files network nodes',
      task: async context_ => {
        const config = context_.config;

        // Get the source node ID from the first consensus node (the state file's original node)
        const sourceNodeId = config.consensusNodes[0].nodeId;

        for (const nodeAlias of context_.config.nodeAliases) {
          const kubeContext: Optional<string> = helpers.extractContextFromConsensusNodes(
            nodeAlias,
            config.consensusNodes,
          );
          if (!kubeContext) {
            throw new SoloError(`Unable to determine Kubernetes context for node ${nodeAlias}`);
          }
          const k8 = this.k8Factory.getK8(kubeContext);
          const podReference = context_.config.podRefs[nodeAlias];
          const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
          const consensusNode = config.consensusNodes.find(node => node.name === nodeAlias);
          if (!consensusNode) {
            throw new SoloError(`Consensus node not found for alias: ${nodeAlias}`);
          }
          const clusterReference = consensusNode.cluster ?? kubeContext;
          const targetNodeId = consensusNode.nodeId;
          const container = await k8.containers().readByRef(containerReference);

          // Determine the state file to use
          let zipFile: string;
          if (
            stateFileDirectory &&
            fs.existsSync(stateFileDirectory) &&
            fs.statSync(stateFileDirectory).isDirectory()
          ) {
            // It's a directory - find the state file for this specific pod
            const podName = podReference.name.name;
            const statesDirectory: string = path.join(
              stateFileDirectory,
              'states',
              clusterReference,
              config.namespace.name,
            );
            if (!fs.existsSync(statesDirectory)) {
              self.logger.showUserError(`No states directory found for node ${nodeAlias} at ${statesDirectory}`);
              throw new SoloError(`No states directory found for node ${nodeAlias} at ${statesDirectory}`);
            }

            const stateFiles: string[] = fs
              .readdirSync(statesDirectory)
              .filter(file => file.startsWith(podName) && file.endsWith('-state.zip'));

            if (stateFiles.length === 0) {
              self.logger.info(`No state file found for pod ${podName} (node: ${nodeAlias})`);
              self.logger.showUserError(`No state file found for pod ${podName} (node: ${nodeAlias})`);
              continue;
            }

            zipFile = path.join(statesDirectory, stateFiles[0]);
            self.logger.info(`Using state file for node ${nodeAlias}: ${stateFiles[0]}`);
          } else {
            // It's a single file or use default from config
            zipFile = stateFileDirectory || config.stateFile;
          }

          self.logger.debug(`Uploading state files to pod ${podReference.name}`);
          await container.copyTo(zipFile, `${constants.HEDERA_HAPI_PATH}/data`);

          self.logger.info(
            `Deleting the previous state files in pod ${podReference.name} directory ${constants.HEDERA_HAPI_PATH}/data/saved`,
          );
          await container.execContainer(['bash', '-c', `rm -rf ${constants.HEDERA_HAPI_PATH}/data/saved/*`]);
          await container.execContainer([
            'unzip',
            '-o',
            `${constants.HEDERA_HAPI_PATH}/data/${path.basename(zipFile)}`,
            '-d',
            `${constants.HEDERA_HAPI_PATH}/data/saved`,
          ]);

          // Fix ownership of extracted state files to hedera user
          // NOTE: zip doesn't preserve Unix ownership - files are owned by whoever runs unzip (root).
          // Unlike tar which preserves UID/GID metadata, zip format doesn't store Unix ownership info.
          // The chown is required so the hedera process can access the extracted state files.
          self.logger.info(`Fixing ownership of extracted state files in pod ${podReference.name}`);
          await container.execContainer([
            'bash',
            '-c',
            `chown -R hedera:hedera ${constants.HEDERA_HAPI_PATH}/data/saved`,
          ]);

          // Clean up old rounds - keep only the latest/biggest round
          self.logger.info(`Cleaning up old rounds in pod ${podReference.name}, keeping only the latest round`);
          const cleanupScriptName = path.basename(constants.CLEANUP_STATE_ROUNDS_SCRIPT);
          const cleanupScriptDestination = `${constants.HEDERA_USER_HOME_DIR}/${cleanupScriptName}`;
          await container.execContainer(['mkdir', '-p', constants.HEDERA_USER_HOME_DIR]);
          await container.copyTo(constants.CLEANUP_STATE_ROUNDS_SCRIPT, constants.HEDERA_USER_HOME_DIR);
          await container.execContainer(['chmod', '+x', cleanupScriptDestination]);
          await sleep(Duration.ofSeconds(1));
          await container.execContainer([cleanupScriptDestination, constants.HEDERA_HAPI_PATH]);

          // Rename node ID directories to match the target node
          if (sourceNodeId !== targetNodeId) {
            self.logger.info(
              `Renaming node ID directories in pod ${podReference.name} from ${sourceNodeId} to ${targetNodeId}`,
            );
            const renameScriptName = path.basename(constants.RENAME_STATE_NODE_ID_SCRIPT);
            const renameScriptDestination = `${constants.HEDERA_USER_HOME_DIR}/${renameScriptName}`;
            await container.execContainer(['mkdir', '-p', constants.HEDERA_USER_HOME_DIR]);
            await container.copyTo(constants.RENAME_STATE_NODE_ID_SCRIPT, constants.HEDERA_USER_HOME_DIR);
            await container.execContainer(['chmod', '+x', renameScriptDestination]);
            await sleep(Duration.ofSeconds(1));
            await container.execContainer([
              renameScriptDestination,
              constants.HEDERA_HAPI_PATH,
              sourceNodeId.toString(),
              targetNodeId.toString(),
            ]);
          }
        }
      },
      skip,
    };
  }

  public identifyNetworkPods(maxAttempts?: number) {
    const self = this;
    return {
      title: 'Identify network pods',
      task: (context_, task) => {
        return self.taskCheckNetworkNodePods(context_, task, context_.config.nodeAliases, maxAttempts);
      },
    };
  }

  public fetchPlatformSoftware(
    aliasesField: string,
  ): SoloListrTask<
    NodeUpgradeContext | NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext | NodeSetupContext
  > {
    const self = this;
    return {
      title: 'Fetch platform software into network nodes',
      task: (context_, task) => {
        const {podRefs, localBuildPath} = context_.config;
        let {releaseTag} = context_.config;

        if (releaseTag) {
          releaseTag = Version.getValidSemanticVersion(releaseTag, true, 'Consensus release tag');
        }

        if ('upgradeVersion' in context_.config) {
          if (!context_.config.upgradeVersion) {
            this.logger.info('Skip, no need to update the platform software');
            return Promise.resolve();
          }
          releaseTag = context_.config.upgradeVersion;
        }

        context_.config.releaseTag = releaseTag;

        return localBuildPath === ''
          ? self._fetchPlatformSoftware(
              context_.config[aliasesField],
              podRefs,
              releaseTag,
              task,
              this.platformInstaller,
              context_.config.consensusNodes,
            )
          : self._uploadPlatformSoftware(
              context_.config[aliasesField],
              podRefs,
              task,
              localBuildPath,
              context_.config.consensusNodes,
              releaseTag,
            );
      },
    };
  }

  public populateServiceMap(): SoloListrTask<NodeAddContext | NodeDestroyContext> {
    return {
      title: 'Populate serviceMap',
      task: async context_ => {
        context_.config.serviceMap = await this.accountManager.getNodeServiceMap(
          context_.config.namespace,
          this.remoteConfig.getClusterRefs(),
          context_.config.deployment,
        );
        if (!context_.config.serviceMap.has(context_.config.nodeAlias)) {
          return;
        }

        context_.config.podRefs[context_.config.nodeAlias] = PodReference.of(
          context_.config.namespace,
          context_.config.serviceMap.get(context_.config.nodeAlias).nodePodName,
        );
      },
    };
  }

  public setupNetworkNodes(
    nodeAliasesProperty: string,
    isGenesis: boolean,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext> {
    return {
      title: 'Setup network nodes',
      task: async (
        {config},
        task,
      ): Promise<SoloListr<NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext>> => {
        if (!config.nodeAliases || config.nodeAliases.length === 0) {
          config.nodeAliases = helpers.parseNodeAliases(
            config.nodeAliasesUnparsed,
            this.remoteConfig.getConsensusNodes(),
            this.configManager,
          );
        }
        if (isGenesis) {
          await this.generateGenesisNetworkJson(
            config.namespace,
            config.consensusNodes,
            config.keysDir,
            config.stagingDir,
            config.domainNamesMapping,
          );
        }

        await this.generateNodeOverridesJson(config.namespace, config.nodeAliases, config.stagingDir);

        const subTasks: SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext>[] =
          [];

        for (const nodeAlias of config[nodeAliasesProperty]) {
          const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);

          subTasks.push({
            title: `Node: ${chalk.yellow(nodeAlias)}`,
            task: (): SoloListr<NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeRefreshContext> =>
              this.platformInstaller.taskSetup(config.podRefs[nodeAlias], config.stagingDir, isGenesis, context),
          });
        }

        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  public setupNetworkNodeFolders(): SoloListrTask<NodeSetupContext> {
    return {
      title: 'setup network node folders',
      skip: (): boolean => {
        const currentVersion: SemVer = this.remoteConfig.configuration.versions.consensusNode;
        const versionRequirement: SemVer = new SemVer('0.63.0');
        return lt(currentVersion, versionRequirement);
      },
      task: async (context_): Promise<void> => {
        for (const consensusNode of context_.config.consensusNodes) {
          const context: string = helpers.extractContextFromConsensusNodes(
            consensusNode.name,
            context_.config.consensusNodes,
          );
          const podReference: PodReference = await this.k8Factory
            .getK8(context)
            .pods()
            .list(NamespaceName.of(consensusNode.namespace), [
              `solo.hedera.com/node-name=${consensusNode.name}`,
              'solo.hedera.com/type=network-node',
            ])
            .then((pods: Pod[]): PodReference => pods[0].podReference);

          const rootContainer: ContainerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);

          const container: Container = this.k8Factory
            .getK8(consensusNode.context)
            .containers()
            .readByRef(rootContainer);

          await container.execContainer('chmod 777 /opt/hgcapp/services-hedera/HapiApp2.0/data');

          // save consensus node version in remote config
          this.remoteConfig.updateComponentVersion(
            ComponentTypes.ConsensusNode,
            new SemVer(context_.config.releaseTag),
          );
          await this.remoteConfig.persist();
        }
      },
    };
  }

  public showUserMessages(): SoloListrTask<NodeStartContext> {
    return {
      title: 'Show user messages',
      task: (): void => {
        this.logger.showAllMessageGroups();
      },
    };
  }

  public setGrpcWebEndpoint(nodeAliasesProperty: string): SoloListrTask<NodeStartContext> {
    return {
      title: 'set gRPC Web endpoint',
      skip: ({config: {app}}): boolean => {
        // skip setting the gRPC Web endpoint if we are not running a Consensus Node
        if (app !== constants.HEDERA_APP_NAME) {
          return true;
        }

        const currentVersion: SemVer = this.remoteConfig.configuration.versions.consensusNode;
        const versionRequirement: SemVer = new SemVer(MINIMUM_HIERO_PLATFORM_VERSION_FOR_GRPC_WEB_ENDPOINTS);
        return lt(currentVersion, versionRequirement);
      },
      task: async ({config}): Promise<void> => {
        const {namespace, deployment, adminKey} = config;

        const serviceMap: NodeServiceMapping = await this.accountManager.getNodeServiceMap(
          namespace,
          this.remoteConfig.getClusterRefs(),
          deployment,
        );

        for (const nodeAlias of config[nodeAliasesProperty]) {
          const networkNodeService: NetworkNodeServices = serviceMap.get(nodeAlias);

          const cluster: Readonly<ClusterSchema> = this.remoteConfig.configuration.clusters.find(
            (cluster): boolean => cluster.namespace === namespace.name,
          );

          const grpcProxyPort: number = +networkNodeService.envoyProxyGrpcWebPort;

          const nodeClient: Client = await this.accountManager.loadNodeClient(
            namespace,
            this.remoteConfig.getClusterRefs(),
            deployment,
          );

          const grpcWebProxyEndpoint: ServiceEndpoint = new ServiceEndpoint().setPort(grpcProxyPort);

          if (networkNodeService.envoyProxyLoadBalancerIp) {
            const svc: Service[] = await this.k8Factory
              .getK8(networkNodeService.context)
              .services()
              .list(config.namespace, [
                `solo.hedera.com/node-id=${networkNodeService.nodeId},solo.hedera.com/type=network-node-svc`,
              ]);

            grpcWebProxyEndpoint.setDomainName(
              Templates.renderSvcFullyQualifiedDomainName(svc[0].metadata.name, namespace.name, cluster.dnsBaseDomain),
            );
          } else {
            grpcWebProxyEndpoint.setDomainName(
              Templates.renderSvcFullyQualifiedDomainName(
                networkNodeService.envoyProxyName,
                namespace.name,
                cluster.dnsBaseDomain,
              ),
            );
          }

          let updateTransaction: NodeUpdateTransaction = new NodeUpdateTransaction()
            .setNodeId(Long.fromString(networkNodeService.nodeId.toString()))
            .setGrpcWebProxyEndpoint(grpcWebProxyEndpoint)
            .freezeWith(nodeClient);

          if (adminKey) {
            updateTransaction = await updateTransaction.sign(adminKey);
          }

          const transactionResponse: TransactionResponse = await updateTransaction.execute(nodeClient);
          const updateTransactionReceipt: TransactionReceipt = await transactionResponse.getReceipt(nodeClient);

          if (updateTransactionReceipt.status !== Status.Success) {
            throw new SoloError('Failed to set gRPC web proxy endpoint');
          }
        }
      },
    };
  }

  // generates the node overrides file.  This file is used to override the address book.  It is useful in cases where
  // there is a hair pinning issue and the node needs to connect to itself via a different address.
  private async generateNodeOverridesJson(
    namespace: NamespaceName,
    nodeAliases: NodeAliases,
    stagingDirectory: string,
  ): Promise<void> {
    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServiceMap = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfig.getClusterRefs(),
      deploymentName,
    );

    const nodeOverridesModel = new NodeOverridesModel(nodeAliases, networkNodeServiceMap);

    const nodeOverridesYaml = PathEx.join(stagingDirectory, constants.NODE_OVERRIDE_FILE);
    fs.writeFileSync(nodeOverridesYaml, nodeOverridesModel.toYAML());
  }

  /**
   * Generate genesis network json file
   * @param namespace - namespace
   * @param consensusNodes - consensus nodes
   * @param keysDirectory - keys directory
   * @param stagingDirectory - staging directory
   * @param domainNamesMapping
   */
  private async generateGenesisNetworkJson(
    namespace: NamespaceName,
    consensusNodes: ConsensusNode[],
    keysDirectory: string,
    stagingDirectory: string,
    domainNamesMapping?: Record<NodeAlias, string>,
  ): Promise<void> {
    const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    const networkNodeServiceMap = await this.accountManager.getNodeServiceMap(
      namespace,
      this.remoteConfig.getClusterRefs(),
      deploymentName,
    );

    let adminPublicKeys: string[] = [];
    adminPublicKeys = this.configManager.getFlag(flags.adminPublicKeys)
      ? splitFlagInput(this.configManager.getFlag(flags.adminPublicKeys))
      : (Array.from({length: consensusNodes.length}).fill(constants.GENESIS_PUBLIC_KEY.toString()) as string[]);
    const genesisNetworkData = await GenesisNetworkDataConstructor.initialize(
      consensusNodes,
      this.keyManager,
      this.accountManager,
      keysDirectory,
      networkNodeServiceMap,
      adminPublicKeys,
      domainNamesMapping,
    );

    const genesisNetworkJson = PathEx.join(stagingDirectory, 'genesis-network.json');
    fs.writeFileSync(genesisNetworkJson, genesisNetworkData.toJSON());
  }

  public prepareStagingDirectory(nodeAliasesProperty: string): AnyListrContext {
    return {
      title: 'Prepare staging directory',
      task: ({config}, task): Promise<void> => {
        const nodeAliases: NodeAliases = config[nodeAliasesProperty];
        const subTasks: SoloListrTask<AnyListrContext>[] = [
          {
            title: 'Create and populate staging directory',
            task: async ({config: {cacheDir}}): Promise<void> => {
              const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
              const applicationPropertiesPath: string = PathEx.joinWithRealPath(
                cacheDir,
                'templates',
                'application.properties',
              );

              const consensusNodes: ConsensusNode[] = this.remoteConfig.getConsensusNodes();
              const yamlRoot: AnyObject = {};
              const emptyDomainNamesMapping: Record<string, IP> = {};

              const stagingDirectory: string = Templates.renderStagingDir(
                this.configManager.getFlag(flags.cacheDir),
                this.configManager.getFlag(flags.releaseTag),
              );

              if (!fs.existsSync(stagingDirectory)) {
                await this.profileManager.prepareStagingDirectory(
                  consensusNodes,
                  nodeAliases,
                  yamlRoot,
                  emptyDomainNamesMapping,
                  deploymentName,
                  applicationPropertiesPath,
                );
              }
            },
          },
          {
            title: 'Copy Gossip keys to staging',
            task: async () => {
              this.keyManager.copyGossipKeysToStaging(config.keysDir, config.stagingKeysDir, nodeAliases);
            },
          },
          {
            title: 'Copy gRPC TLS keys to staging',
            task: async () => {
              for (const nodeAlias of nodeAliases) {
                const tlsKeyFiles = this.keyManager.prepareTlsKeyFilePaths(nodeAlias, config.keysDir);
                this.keyManager.copyNodeKeysToStaging(tlsKeyFiles, config.stagingKeysDir);
              }
            },
          },
        ];
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.DEFAULT);
      },
    };
  }

  public startNodes(nodeAliasesProperty: string) {
    return {
      title: 'Starting nodes',
      task: (context_, task) => {
        const config = context_.config;
        const nodeAliases = config[nodeAliasesProperty];
        const subTasks = [];

        for (const nodeAlias of nodeAliases) {
          const podReference = config.podRefs[nodeAlias];
          const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
          subTasks.push({
            title: `Start node: ${chalk.yellow(nodeAlias)}`,
            task: async () => {
              const context = helpers.extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
              const k8 = this.k8Factory.getK8(context);
              await k8
                .containers()
                .readByRef(containerReference)
                .execContainer([
                  'bash',
                  '-c',
                  'systemctl stop network-node || true && systemctl enable --now network-node',
                ]);
            },
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  public enablePortForwarding(enablePortForwardHaProxy: boolean = false) {
    return {
      title: 'Enable port forwarding for debug port and/or GRPC port',
      task: async context_ => {
        const nodeAlias: NodeAlias = context_.config.debugNodeAlias || 'node1';
        const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

        if (context_.config.debugNodeAlias) {
          const podReference: PodReference = PodReference.of(
            context_.config.namespace,
            PodName.of(`network-${nodeAlias}-0`),
          );
          this.logger.showUser('Enable port forwarding for JVM debugger');
          this.logger.debug(`Enable port forwarding for JVM debugger on pod ${podReference.name}`);
          await this.k8Factory
            .getK8(context)
            .pods()
            .readByReference(podReference)
            .portForward(constants.JVM_DEBUG_PORT, constants.JVM_DEBUG_PORT, true, true);
        }
        if (context_.config.forcePortForward && enablePortForwardHaProxy) {
          const pods: Pod[] = await this.k8Factory
            .getK8(context)
            .pods()
            .list(context_.config.namespace, ['solo.hedera.com/node-id=0', 'solo.hedera.com/type=haproxy']);
          if (pods.length === 0) {
            throw new SoloError(`No HAProxy pod found for node alias: ${nodeAlias}`);
          }
          const podReference: PodReference = pods[0].podReference;
          const nodeId: number = Templates.nodeIdFromNodeAlias(nodeAlias);
          await this.remoteConfig.configuration.components.managePortForward(
            undefined,
            podReference,
            constants.GRPC_PORT, // Pod port
            constants.GRPC_PORT, // Local port
            this.k8Factory.getK8(context_.config.clusterContext),
            this.logger,
            ComponentTypes.ConsensusNode,
            'Consensus Node gRPC',
            context_.config.isChartInstalled, // Reuse existing port if chart is already installed
            nodeId,
          );
          await this.remoteConfig.persist();
        }
      },
      skip: context_ => !context_.config.debugNodeAlias && !context_.config.forcePortForward,
    };
  }

  public checkAllNodesAreActive(nodeAliasesProperty: string): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check all nodes are ACTIVE',
      task: (context_, task) => {
        return this._checkNodeActivenessTask(context_, task, context_.config[nodeAliasesProperty]);
      },
    };
  }

  public checkAllNodesAreFrozen(nodeAliasesProperty: string) {
    return {
      title: 'Check all nodes are FROZEN',
      task: (context_, task) => {
        return this._checkNodeActivenessTask(
          context_,
          task,
          context_.config[nodeAliasesProperty],
          NodeStatusCodes.FREEZE_COMPLETE,
        );
      },
    };
  }

  public checkNodeProxiesAreActive(): SoloListrTask<NodeStartContext | NodeRefreshContext | NodeRestartContext> {
    return {
      title: 'Check node proxies are ACTIVE',
      task: (context_, task) => {
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        return this._checkNodesProxiesTask(task, context_.config.nodeAliases) as SoloListr<AnyListrContext>;
      }, // NodeStartConfigClass NodeRefreshContext
      skip: async context_ =>
        (context_.config as NodeStartConfigClass | NodeRefreshConfigClass).app !== '' &&
        (context_.config as NodeStartConfigClass | NodeRefreshConfigClass).app !== constants.HEDERA_APP_NAME,
    };
  }

  public checkAllNodeProxiesAreActive(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext
  > {
    return {
      title: 'Check all node proxies are ACTIVE',
      task: (context_, task) => {
        // this is more reliable than checking the nodes logs for ACTIVE, as the
        // logs will have a lot of white noise from being behind
        return this._checkNodesProxiesTask(task, context_.config.allNodeAliases) as SoloListr<AnyListrContext>;
      },
    };
  }

  // Update account manager and transfer hbar for staking purpose
  public triggerStakeWeightCalculate<T extends {config: AnyObject}>(
    transactionType: NodeSubcommandType,
  ): SoloListrTask<T> {
    const self = this;
    return {
      title: 'Trigger stake weight calculate',
      task: async context_ => {
        const config = context_.config;
        self.logger.info(
          'sleep 60 seconds for the handler to be able to trigger the network node stake weight recalculate',
        );
        await sleep(Duration.ofSeconds(60));
        const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
        const accountMap = this.accountManager.getNodeAccountMap(config.allNodeAliases, deploymentName);
        let skipNodeAlias: NodeAlias;

        switch (transactionType) {
          case NodeSubcommandType.ADD: {
            break;
          }
          case NodeSubcommandType.UPDATE: {
            if (config.newAccountNumber) {
              // update map with current account ids
              accountMap.set(config.nodeAlias, config.newAccountNumber);
              skipNodeAlias = config.nodeAlias;
            }
            break;
          }
          case NodeSubcommandType.DESTROY: {
            if (config.nodeAlias) {
              accountMap.delete(config.nodeAlias);
              skipNodeAlias = config.nodeAlias;
            }
          }
        }

        config.nodeClient = await self.accountManager.refreshNodeClient(
          config.namespace,
          this.remoteConfig.getClusterRefs(),
          skipNodeAlias,
          this.configManager.getFlag<DeploymentName>(flags.deployment),
        );

        // send some write transactions to invoke the handler that will trigger the stake weight recalculate
        const treasuryAccountId = this.accountManager.getTreasuryAccountId(deploymentName);
        for (const nodeAlias of accountMap.keys()) {
          const accountId = accountMap.get(nodeAlias);
          config.nodeClient.setOperator(treasuryAccountId, config.treasuryKey);
          await self.accountManager.transferAmount(treasuryAccountId, accountId, 1);
        }
      },
    };
  }

  public addNodeStakes(): SoloListrTask<NodeStartContext> {
    const self = this;
    return {
      title: 'Add node stakes',
      task: (context_, task): SoloListr<NodeStartContext> | void => {
        if (context_.config.app === '' || context_.config.app === constants.HEDERA_APP_NAME) {
          const subTasks: SoloListrTask<NodeStartContext>[] = [];

          const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
          const accountMap = this.accountManager.getNodeAccountMap(context_.config.nodeAliases, deploymentName);
          // @ts-expect-error - TS2339: Property stakeAmount does not exist on type NodeStartConfigClass
          // TODO: 'ctx.config.stakeAmount' is never initialized in the config
          const stakeAmountParsed = context_.config.stakeAmount ? splitFlagInput(context_.config.stakeAmount) : [];
          let nodeIndex = 0;
          for (const nodeAlias of context_.config.nodeAliases) {
            const accountId = accountMap.get(nodeAlias);
            const stakeAmount =
              stakeAmountParsed.length > 0 ? stakeAmountParsed[nodeIndex] : HEDERA_NODE_DEFAULT_STAKE_AMOUNT;
            subTasks.push({
              title: `Adding stake for node: ${chalk.yellow(nodeAlias)}`,
              task: async () => await self._addStake(context_.config.namespace, accountId, nodeAlias, +stakeAmount),
            });
            nodeIndex++;
          }

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: false,
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        }
      },
    };
  }

  public stakeNewNode(): SoloListrTask<NodeAddContext> {
    const self = this;
    return {
      title: 'Stake new node',
      task: async context_ => {
        await self.accountManager.refreshNodeClient(
          context_.config.namespace,
          this.remoteConfig.getClusterRefs(),
          context_.config.nodeAlias,
          this.configManager.getFlag<DeploymentName>(flags.deployment),
          this.configManager.getFlag<boolean>(flags.forcePortForward),
        );
        await this._addStake(context_.config.namespace, context_.newNode.accountId, context_.config.nodeAlias);
      },
    };
  }

  public stopNodes(
    nodeAliasesProperty: string,
  ): SoloListrTask<NodeStopContext | NodeFreezeContext | NodeDestroyContext> {
    return {
      title: 'Stopping nodes',
      task: async (context_, task) => {
        const subTasks: SoloListrTask<NodeStopContext | NodeFreezeContext | NodeDestroyContext>[] = [];

        if (!(context_.config as CheckedNodesConfigClass).skipStop) {
          await this.accountManager.close();
          for (const nodeAlias of context_.config[nodeAliasesProperty]) {
            const podReference = (context_.config as CheckedNodesConfigClass).podRefs[nodeAlias];
            const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
            const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

            subTasks.push({
              title: `Stop node: ${chalk.yellow(nodeAlias)}`,
              task: async () =>
                await this.k8Factory
                  .getK8(context)
                  .containers()
                  .readByRef(containerReference)
                  .execContainer(['bash', '-c', 'systemctl disable --now network-node']),
            });
          }
        }

        // setup the sub-tasks
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  public finalize(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Finalize',
      task: () => {
        // reset flags so that keys are not regenerated later
        this.configManager.setFlag(flags.generateGossipKeys, false);
        this.configManager.setFlag(flags.generateTlsKeys, false);
      },
    };
  }

  public dumpNetworkNodesSaveState(): SoloListrTask<NodeRefreshContext> {
    return {
      title: 'Dump network nodes saved state',
      task: (context_, task) => {
        const config: NodeRefreshConfigClass = context_.config;
        const subTasks: SoloListrTask<NodeRefreshContext>[] = [];

        for (const nodeAlias of config.nodeAliases) {
          const podReference = config.podRefs[nodeAlias];
          const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);

          subTasks.push({
            title: `Node: ${chalk.yellow(nodeAlias)}`,
            task: async () =>
              await this.k8Factory
                .getK8(context)
                .containers()
                .readByRef(containerReference)
                .execContainer(['bash', '-c', `rm -rf ${constants.HEDERA_HAPI_PATH}/data/saved/*`]),
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, {
          concurrent: true,
          rendererOptions: {
            collapseSubtasks: false,
          },
        });
      },
    };
  }

  public getNodeLogsAndConfigs(): SoloListrTask<
    NodeUpdateContext | NodeAddContext | NodeDestroyContext | NodeUpgradeContext
  > {
    return {
      title: 'Get consensus node logs and configs',
      task: async ({config: {namespace, contexts}}): Promise<void> => {
        await container.resolve<NetworkNodes>(NetworkNodes).getLogs(namespace, contexts);
      },
    };
  }

  private async checkLocalPort(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve): void => {
      const socket: net.Socket = new net.Socket();

      socket.setTimeout(2000);

      socket.on('timeout', (): void => resolve(false));
      socket.on('error', (): void => resolve(false));

      socket.on('connect', (): void => {
        socket.destroy();
        resolve(true);
      });

      socket.connect(port, 'localhost');
    });
  }

  private async getComponentData(
    schema: BaseStateSchema,
    componentDisplayName: ComponentDisplayName,
  ): Promise<ComponentData> {
    const metadata: ComponentStateMetadataSchema = schema.metadata;

    const clusterSchema: Readonly<ClusterSchema> = this.remoteConfig.configuration.clusters.find(
      (cluster): boolean => cluster.name === metadata.cluster,
    );

    const namespace: NamespaceName = NamespaceName.of(metadata.namespace);
    const clusterReference: ClusterReferenceName = clusterSchema.name;
    const contextName: Context = this.localConfig.configuration.clusterRefs.get(clusterSchema.name)?.toString();
    const componentId: ComponentId = metadata.id;

    return {
      clusterReference,
      contextName,
      componentId,
      namespace,
      componentDisplayName,
      portForwards: metadata.portForwardConfigs,
    };
  }

  private extractDataFromGroup(
    states: BaseStateSchema[],
    componentDisplayName: ComponentDisplayName,
  ): Promise<ComponentData>[] {
    return states.map((state): Promise<ComponentData> => this.getComponentData(state, componentDisplayName));
  }

  private validateComponentData({
    portForwards,
    namespace,
    clusterReference,
    contextName,
    componentId,
    componentDisplayName,
  }: ComponentData): SoloListrTask<NodeConnectionsContext> {
    return {
      title: cyan(componentDisplayName),
      task: (_, task): SoloListr<NodeConnectionsContext> | void => {
        portForwards = portForwards || [];

        if (portForwards.length === 0) {
          task.title += ` - ${yellow('No port forward configs')}`;
        }

        task.title += `\n${gray('Id:')} ${yellow(componentId)}`;
        task.title += `\n${gray('Namespace:')} ${yellow(namespace)}`;
        task.title += `\n${gray('Context:')} ${yellow(contextName)}`;
        task.title += `\n${gray('Cluster Reference:')} ${yellow(clusterReference)}`;

        if (portForwards.length === 0) {
          return;
        }

        const subTasks: SoloListrTask<NodeConnectionsContext>[] = [];

        for (const {localPort, podPort} of portForwards) {
          subTasks.push({
            title: 'Port forward config: ',
            task: async (_, task): Promise<void> => {
              task.title += '\n\t' + gray('Local port') + ' ' + yellow(`[${localPort}]`) + ' - ';

              task.title += (await this.checkLocalPort(localPort))
                ? green('Successfully pinged')
                : red('Failed to ping');

              task.title += '\n\t' + gray('Pod port') + ' ' + yellow(`[${podPort}]`);
            },
          });
        }

        return task.newListr(subTasks, {concurrent: true, rendererOptions: {collapseSubtasks: false}});
      },
    };
  }

  public testAccountCreation(): SoloListrTask<NodeConnectionsContext> {
    return {
      title: 'Test create account',
      task: async ({config}, task): Promise<void> => {
        const {namespace, deployment, context} = config;

        await this.accountManager.loadNodeClient(namespace, this.remoteConfig.getClusterRefs(), deployment);

        try {
          const privateKey: PrivateKey = PrivateKey.generateECDSA();

          config.newAccount = await this.accountManager.createNewAccount(namespace, privateKey, 0, true, context);

          task.title += ` - ${green('Success')}`;
        } catch (error) {
          this.logger.showUser(error);
          task.title += ` - ${red('Fail')}`;
        }
      },
    };
  }

  public prepareDiagnosticsData(): SoloListrTask<NodeConnectionsContext> {
    return {
      title: 'Prepare diagnostics data',
      task: async ({config}): Promise<void> => {
        const state: DeploymentStateSchema = this.remoteConfig.configuration.components.state;

        config.componentsData = await Promise.all([
          ...this.extractDataFromGroup(state.mirrorNodes, 'Mirror node'),
          ...this.extractDataFromGroup(state.relayNodes, 'Relay node'),
          ...this.extractDataFromGroup(state.consensusNodes, 'Consensus node'),
          ...this.extractDataFromGroup(state.explorers, 'Explorer node'),
          ...this.extractDataFromGroup(state.blockNodes, 'Block node'),
        ]);
      },
    };
  }

  public validateLocalPorts(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Test local ports',
      task: async ({config: {componentsData}}, task): Promise<SoloListr<AnyListrContext>> => {
        const subTasks: SoloListrTask<AnyListrContext>[] = [];

        for (const componentData of componentsData) {
          subTasks.push(this.validateComponentData(componentData));
        }

        return task.newListr(subTasks, {concurrent: true, rendererOptions: {collapseSubtasks: false}});
      },
    };
  }

  public testRelay(): SoloListrTask<NodeConnectionsContext> {
    return {
      title: 'Test relay',
      task: async ({config: {componentsData, newAccount}}, task): Promise<void> => {
        const relayData: ComponentData = componentsData.find(
          (data): boolean => data.componentDisplayName === 'Relay node',
        );

        if (!relayData) {
          task.title += gray(' - No relay data') + ' ' + yellow('[SKIPPING]');
          return;
        }

        if (!relayData.portForwards || relayData.portForwards.length === 0) {
          task.title += gray(' - No relay port-forwards') + ' ' + yellow('[SKIPPING]');
          return;
        }

        task.title += gray(' - Testing relay');

        const url: string = `http://localhost:${relayData.portForwards[0].localPort}`;

        const rpc: (method: string, parameters?: any[]) => Promise<any> = async (
          method: string,
          parameters: any[] = [],
        ): Promise<any> => {
          const response: Response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              jsonrpc: '2.0',
              method,
              params: parameters,
              id: 1,
            }),
          });
          if (!response.ok) {
            throw new Error(await response.text());
          }

          const data: any = await response.json();

          if (data.error) {
            throw new Error(JSON.stringify(data.error));
          }

          return data.result;
        };

        try {
          let textData: string = '\n';

          // Get Client Version
          const version: string = await rpc('web3_clientVersion');
          textData += gray('Relay responded with version: ') + yellow(version) + '\n';

          // Get chain ID
          const chainId: string = await rpc('eth_chainId');
          textData += gray('Relay chainId: ') + yellow(chainId) + '\n';

          // Get block number
          const blockNumberHex: string = await rpc('eth_blockNumber');
          const blockNumber: number = Number.parseInt(blockNumberHex, 16);
          textData += gray('Latest block number: ') + yellow(blockNumber) + '\n';

          // Get Account balance
          const accountEvmAddress: string = `0x${newAccount.accountAlias.split('.')[2]}`;
          const balanceHex: string = await rpc('eth_getBalance', [accountEvmAddress, 'latest']);
          const balance: number = Number.parseInt(balanceHex, 16);
          textData += gray('Account balance: ') + yellow(`${balance} wei`) + '\n';

          task.title += ' ' + green('[SUCCESS]') + textData;
        } catch (error) {
          this.logger.showUser('Relay test failed: ' + (error instanceof Error ? error.message : error));
          task.title += ' ' + red('[FAILED]');
        }
      },
    };
  }

  public fetchAccountFromExplorer(): SoloListrTask<NodeConnectionsContext> {
    return {
      title: 'Test account is created',
      task: async ({config: {componentsData, newAccount}}, task): Promise<void> => {
        const explorerData: ComponentData = componentsData.find(
          (data): boolean => data.componentDisplayName === 'Explorer node',
        );

        if (!explorerData) {
          task.title += gray(' - No explorer data') + ' ' + yellow('[SKIPPING]');
          return;
        }

        if (!explorerData.portForwards || explorerData.portForwards.length === 0) {
          task.title += gray(' - No explorer port-forwards') + ' ' + yellow('[SKIPPING]');
          return;
        }

        if (!newAccount?.accountId) {
          task.title += gray(' - No new account data') + ' ' + yellow('[SKIPPING]');
          return;
        }

        const accountId: string = newAccount.accountId;

        task.title += gray(' - Attempting to fetch from explorer') + ' ' + cyan(`[${accountId}]`);

        const localPort: number = explorerData.portForwards[0].localPort;

        const response: Response = await fetch(`http://localhost:${localPort}/api/v1/accounts/${accountId}`);

        if (!response.ok) {
          const text: string = await response.text();
          this.logger.showUser('Explorer fetch error: ' + text);
          return;
        }

        task.title += ' ' + green('[SUCCESS]');
      },
    };
  }

  public getNodeStateFiles(): SoloListrTask<NodeStatesContext> {
    return {
      title: 'Get node states',
      task: async context_ => {
        for (const nodeAlias of context_.config.nodeAliases) {
          const context = helpers.extractContextFromConsensusNodes(nodeAlias, context_.config.consensusNodes);
          await container
            .resolve<NetworkNodes>(NetworkNodes)
            .getStatesFromPod(context_.config.namespace, nodeAlias, context);
        }
      },
    };
  }

  public checkPVCsEnabled(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Check that PVCs are enabled',
      task: async context_ => {
        if (!this.configManager.getFlag(flags.persistentVolumeClaims)) {
          throw new SoloError('PVCs flag are not enabled. Please enable PVCs before adding a node');
        }

        // Create an array of promises
        const promises = context_.config.contexts.map(async context => {
          // Fetch all PVCs inside the namespace using the context
          const pvcs: string[] = await this.k8Factory
            .getK8(context)
            .pvcs()
            .list(context_.config.namespace, ['solo.hedera.com/type=node-pvc']);

          this.logger.info(`Found ${pvcs.length} PVCs in namespace ${context_.config.namespace}: ${pvcs.join(', ')}`);
          if (pvcs.length === 0) {
            throw new SoloError(
              'No PVCs found in the namespace. Please ensure PVCs are enabled during network deployment.',
            );
          }
          return pvcs;
        });

        // Wait for all promises to resolve
        await Promise.all(promises);
      },
    };
  }

  public determineNewNodeAccountNumber(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Determine new node account number',
      task: context_ => {
        const config: NodeAddConfigClass = context_.config;
        const values = {hedera: {nodes: []}};
        let maxNumber: Long = Long.fromNumber(0);

        let lastNodeAlias: NodeAlias = DEFAULT_NETWORK_NODE_NAME;

        for (const networkNodeServices of config.serviceMap.values()) {
          values.hedera.nodes.push({
            accountId: networkNodeServices.accountId,
            name: networkNodeServices.nodeAlias,
            nodeId: networkNodeServices.nodeId,
          });
          maxNumber = Long.fromNumber(
            Math.max(maxNumber.toNumber(), AccountId.fromString(networkNodeServices.accountId).num.toNumber()),
          );
          lastNodeAlias = networkNodeServices.nodeAlias;
        }

        const lastNodeIdMatch = lastNodeAlias.match(/\d+$/);
        if (lastNodeIdMatch.length > 0) {
          const incremented = Number.parseInt(lastNodeIdMatch[0]) + 1;
          lastNodeAlias = lastNodeAlias.replace(/\d+$/, incremented.toString()) as NodeAlias;
        }

        const deploymentName: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
        context_.maxNum = maxNumber.add(1);
        context_.newNode = {
          accountId: this.accountManager.getAccountIdByNumber(deploymentName, context_.maxNum).toString(),
          name: lastNodeAlias,
        };
        config.nodeAlias = lastNodeAlias as NodeAlias;
        config.allNodeAliases.push(lastNodeAlias as NodeAlias);
        config.newNodeAliases = [lastNodeAlias as NodeAlias];
      },
    };
  }

  public generateGossipKeys(): SoloListrTask<NodeKeysContext> {
    return this._generateGossipKeys(true) as SoloListrTask<NodeKeysContext>;
  }

  public generateGossipKey(): SoloListrTask<NodeAddContext> {
    return this._generateGossipKeys(false) as SoloListrTask<NodeAddContext>;
  }

  public generateGrpcTlsKeys(): SoloListrTask<NodeKeysContext> {
    return this._generateGrpcTlsKeys(true) as SoloListrTask<NodeKeysContext>;
  }

  public generateGrpcTlsKey(): SoloListrTask<NodeAddContext> {
    return this._generateGrpcTlsKeys(false) as SoloListrTask<NodeAddContext>;
  }

  public loadSigningKeyCertificate(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Load signing key certificate',
      task: context_ => {
        const config = context_.config;
        const signingCertFile = Templates.renderGossipPemPublicKeyFile(config.nodeAlias);
        const signingCertFullPath = PathEx.joinWithRealPath(config.keysDir, signingCertFile);
        context_.signingCertDer = this.keyManager.getDerFromPemCertificate(signingCertFullPath);
      },
    };
  }

  public computeMTLSCertificateHash(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Compute mTLS certificate hash',
      task: context_ => {
        const config = context_.config;
        const tlsCertFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias);
        const tlsCertFullPath = PathEx.joinWithRealPath(config.keysDir, tlsCertFile);
        const tlsCertDer = this.keyManager.getDerFromPemCertificate(tlsCertFullPath);
        context_.tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest();
      },
    };
  }

  public prepareGossipEndpoints(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Prepare gossip endpoints',
      task: async (context_): Promise<void> => {
        const config: any = context_.config;
        let endpoints: string[] = [];
        if (config.gossipEndpoints) {
          endpoints = splitFlagInput(config.gossipEndpoints);
        } else {
          const context: string = helpers.extractContextFromConsensusNodes(
            config.consensusNodes[0].name,
            config.consensusNodes,
          );

          const k8: K8 = this.k8Factory.getK8(context);

          const externalEndpointAddress: Address = await Address.getExternalAddress(
            new ConsensusNode(
              config.nodeAlias,
              Templates.nodeIdFromNodeAlias(config.nodeAlias),
              config.namespace,
              undefined,
              context,
              config.consensusNodes[0].dnsBaseDomain,
              config.consensusNodes[0].dnsConsensusNodePattern,
              Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias),
              [],
            ),
            k8,
            +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
          );

          endpoints = [
            `${helpers.getInternalAddress(config.releaseTag, config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT}`,
            `${externalEndpointAddress.formattedAddress()}`,
          ];
        }

        context_.gossipEndpoints = prepareEndpoints(
          config.endpointType,
          endpoints,
          constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT,
        );
      },
    };
  }

  public refreshNodeList(): SoloListrTask<NodeDestroyContext> {
    return {
      title: 'Refresh node alias list',
      task: context_ => {
        context_.config.allNodeAliases = context_.config.existingNodeAliases.filter(
          (nodeAlias: NodeAlias) => nodeAlias !== context_.config.nodeAlias,
        );

        context_.config.refreshedConsensusNodes = context_.config.consensusNodes.filter(
          (consensusNode: ConsensusNode) => consensusNode.name !== context_.config.nodeAlias,
        );
      },
    };
  }

  public prepareGrpcServiceEndpoints(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Prepare grpc service endpoints',
      task: context_ => {
        const config = context_.config;
        let endpoints = [];

        if (config.grpcEndpoints) {
          endpoints = splitFlagInput(config.grpcEndpoints);
        } else {
          if (config.endpointType !== constants.ENDPOINT_TYPE_FQDN) {
            throw new SoloError(`--grpc-endpoints must be set if --endpoint-type is: ${constants.ENDPOINT_TYPE_IP}`);
          }

          endpoints = [
            `${Templates.renderFullyQualifiedNetworkSvcName(config.namespace, config.nodeAlias)}:${constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT}`,
          ];
        }

        context_.grpcServiceEndpoints = prepareEndpoints(
          config.endpointType,
          endpoints,
          constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
        );
      },
    };
  }

  public sendNodeUpdateTransaction(): SoloListrTask<NodeUpdateContext> {
    const self = this;
    return {
      title: 'Send node update transaction',
      task: async context_ => {
        const config = context_.config;

        const nodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);
        self.logger.info(`nodeId: ${nodeId}, config.newAccountNumber: ${config.newAccountNumber}`);

        if (config.existingNodeAliases.length > 1) {
          config.nodeClient = await self.accountManager.refreshNodeClient(
            config.namespace,
            this.remoteConfig.getClusterRefs(),
            config.nodeAlias,
            this.configManager.getFlag<DeploymentName>(flags.deployment),
          );
        }

        try {
          let nodeUpdateTx = new NodeUpdateTransaction().setNodeId(new Long(nodeId));

          if (config.tlsPublicKey && config.tlsPrivateKey) {
            self.logger.info(`config.tlsPublicKey: ${config.tlsPublicKey}`);
            const tlsCertDer = self.keyManager.getDerFromPemCertificate(config.tlsPublicKey);
            const tlsCertHash = crypto.createHash('sha384').update(tlsCertDer).digest();
            nodeUpdateTx = nodeUpdateTx.setCertificateHash(tlsCertHash);

            const publicKeyFile = Templates.renderTLSPemPublicKeyFile(config.nodeAlias);
            const privateKeyFile = Templates.renderTLSPemPrivateKeyFile(config.nodeAlias);
            renameAndCopyFile(config.tlsPublicKey, publicKeyFile, config.keysDir, self.logger);
            renameAndCopyFile(config.tlsPrivateKey, privateKeyFile, config.keysDir, self.logger);
          }

          if (config.gossipPublicKey && config.gossipPrivateKey) {
            self.logger.info(`config.gossipPublicKey: ${config.gossipPublicKey}`);
            const signingCertDer = self.keyManager.getDerFromPemCertificate(config.gossipPublicKey);
            nodeUpdateTx = nodeUpdateTx.setGossipCaCertificate(signingCertDer);

            const publicKeyFile = Templates.renderGossipPemPublicKeyFile(config.nodeAlias);
            const privateKeyFile = Templates.renderGossipPemPrivateKeyFile(config.nodeAlias);
            renameAndCopyFile(config.gossipPublicKey, publicKeyFile, config.keysDir, self.logger);
            renameAndCopyFile(config.gossipPrivateKey, privateKeyFile, config.keysDir, self.logger);
          }

          if (config.newAccountNumber) {
            nodeUpdateTx = nodeUpdateTx.setAccountId(config.newAccountNumber);
          }

          let parsedNewKey: PrivateKey;
          if (config.newAdminKey) {
            parsedNewKey = PrivateKey.fromStringED25519(config.newAdminKey.toString());
            nodeUpdateTx = nodeUpdateTx.setAdminKey(parsedNewKey.publicKey);
          }
          nodeUpdateTx = nodeUpdateTx.freezeWith(config.nodeClient);

          // config.adminKey contains the original key, needed to sign the transaction
          if (config.newAdminKey) {
            nodeUpdateTx = await nodeUpdateTx.sign(parsedNewKey);
          }
          const signedTx = await nodeUpdateTx.sign(config.adminKey);
          const txResp = await signedTx.execute(config.nodeClient);
          const nodeUpdateReceipt = await txResp.getReceipt(config.nodeClient);
          self.logger.debug(`NodeUpdateReceipt: ${nodeUpdateReceipt.toString()}`);

          // If admin key was updated, save the new key to k8s secret
          if (config.newAdminKey) {
            const context: string = helpers.extractContextFromConsensusNodes(config.nodeAlias, config.consensusNodes);
            const data: {privateKey: string; publicKey: string} = {
              privateKey: Base64.encode(parsedNewKey.toString()),
              publicKey: Base64.encode(parsedNewKey.publicKey.toString()),
            };

            const isAdminKeySecretCreated: boolean = await self.k8Factory
              .getK8(context)
              .secrets()
              .createOrReplace(
                config.namespace,
                Templates.renderNodeAdminKeyName(config.nodeAlias),
                SecretType.OPAQUE,
                data,
                {
                  'solo.hedera.com/node-admin-key': 'true',
                },
              );

            if (!isAdminKeySecretCreated) {
              throw new SoloError(`failed to create admin key secret for node '${config.nodeAlias}'`);
            }

            self.logger.debug(`Updated admin key secret for node ${config.nodeAlias}`);
          }
        } catch (error) {
          throw new SoloError(`Error updating node to network: ${error.message}`, error);
        }
      },
    };
  }

  public copyNodeKeysToSecrets(
    nodeListOverride?: string,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext> {
    return {
      title: 'Copy node keys to secrets',
      task: (context_, task) => {
        const subTasks = this.platformInstaller.copyNodeKeys(
          context_.config.stagingDir,
          nodeListOverride ? context_.config[nodeListOverride] : context_.config.consensusNodes,
          context_.config.contexts,
        );

        // set up the sub-tasks for copying node keys to staging directory
        return task.newListr(subTasks, constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY);
      },
    };
  }

  public updateChartWithConfigMap(
    title: string,
    transactionType: NodeSubcommandType,
    skip: SkipCheck | boolean = false,
  ): SoloListrTask<NodeDestroyContext | NodeAddContext | NodeUpdateContext> {
    const self = this;
    return {
      title,
      task: async (context_): Promise<void> => {
        // Prepare parameter and update the network node chart
        const config: NodeDestroyConfigClass | NodeAddConfigClass | NodeUpdateConfigClass = context_.config;
        const consensusNodes: ConsensusNode[] = config.consensusNodes;
        const clusterReferences: ClusterReferences = this.remoteConfig.getClusterRefs();

        // Make sure valuesArgMap is initialized with empty strings
        const valuesArgumentMap: Record<ClusterReferenceName, string> = {};
        for (const [clusterReference] of clusterReferences) {
          valuesArgumentMap[clusterReference] = '';
        }

        config.serviceMap ||= await self.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );

        let maxNodeId: NodeId = 0;
        for (const nodeAlias of config.existingNodeAliases) {
          maxNodeId = Math.max(Templates.nodeIdFromNodeAlias(nodeAlias), maxNodeId);
        }

        const nodeId: NodeId = maxNodeId + 1;

        const clusterNodeIndexMap: Record<
          ClusterReferenceName,
          Record<NodeId, /* index in the chart -> */ number>
        > = {};

        for (const [clusterReference] of clusterReferences) {
          clusterNodeIndexMap[clusterReference] = {};

          const nodesInCluster: ConsensusNode[] = consensusNodes
            .filter((node): boolean => node.cluster === clusterReference)
            // eslint-disable-next-line unicorn/no-array-sort
            .sort((a, b): number => a.nodeId - b.nodeId);

          for (const [index, node] of nodesInCluster.entries()) {
            clusterNodeIndexMap[clusterReference][node.nodeId] = index;
          }
        }

        switch (transactionType) {
          case NodeSubcommandType.UPDATE: {
            this.prepareValuesArgForNodeUpdate(
              consensusNodes,
              valuesArgumentMap,
              config.serviceMap,
              clusterNodeIndexMap,
              (config as NodeUpdateConfigClass).newAccountNumber,
              config.nodeAlias,
            );
            break;
          }
          case NodeSubcommandType.DESTROY: {
            this.prepareValuesArgForNodeDestroy(
              consensusNodes,
              valuesArgumentMap,
              config.nodeAlias,
              config.serviceMap,
              clusterReferences,
            );
            break;
          }
          case NodeSubcommandType.ADD: {
            this.prepareValuesArgForNodeAdd(
              consensusNodes,
              valuesArgumentMap,
              config.serviceMap,
              clusterNodeIndexMap,
              (config as NodeAddConfigClass).clusterRef,
              nodeId,
              config.nodeAlias,
              (context_ as NodeAddContext).newNode,
              config as NodeAddConfigClass,
            );
            break;
          }
        }

        // Add profile values files
        const profileValuesFile: string = await self.profileManager.prepareValuesForNodeTransaction(
          PathEx.joinWithRealPath(config.stagingDir, 'config.txt'),
          PathEx.joinWithRealPath(config.stagingDir, 'templates', 'application.properties'),
        );

        if (profileValuesFile) {
          const valuesFiles: Record<ClusterReferenceName, string> = BaseCommand.prepareValuesFilesMap(
            clusterReferences,
            undefined, // do not trigger of adding default value file for chart upgrade due to consensus node add or destroy
            profileValuesFile,
            (config as any).valuesFile,
          );

          for (const clusterReference of Object.keys(valuesFiles)) {
            valuesArgumentMap[clusterReference] += valuesFiles[clusterReference];
            this.logger.debug(`Prepared helm chart values for cluster-ref: ${clusterReference}`, {
              valuesArg: valuesArgumentMap,
            });
          }
        }
        // Add Debug options
        const consensusNode = consensusNodes.find(node => node.name === config.debugNodeAlias);
        const clusterReference = consensusNode
          ? consensusNode.cluster
          : this.k8Factory.default().clusters().readCurrent();

        valuesArgumentMap[clusterReference] = addDebugOptions(
          valuesArgumentMap[clusterReference],
          config.debugNodeAlias,
        );

        const clusterReferencesList: ClusterReferenceName[] = [];
        for (const [clusterReference] of clusterReferences) {
          clusterReferencesList.push(clusterReference);
        }

        // Update all charts
        await Promise.all(
          clusterReferencesList.map(async (clusterReference): Promise<void> => {
            const context: Context = this.localConfig.configuration.clusterRefs.get(clusterReference).toString();

            config.soloChartVersion = Version.getValidSemanticVersion(
              config.soloChartVersion,
              false,
              'Solo chart version',
            );

            await self.chartManager.upgrade(
              config.namespace,
              constants.SOLO_DEPLOYMENT_CHART,
              constants.SOLO_DEPLOYMENT_CHART,
              config.chartDirectory || constants.SOLO_TESTING_CHART_URL,
              config.soloChartVersion,
              valuesArgumentMap[clusterReference],
              context,
            );
            showVersionBanner(self.logger, constants.SOLO_DEPLOYMENT_CHART, config.soloChartVersion, 'Upgraded');
          }),
        );
      },
      skip,
    };
  }

  /**
   * Builds the values args for update:
   * - Updates the selected node
   * - Keep the rest the same
   */
  private prepareValuesArgForNodeUpdate(
    consensusNodes: ConsensusNode[],
    valuesArgumentMap: Record<ClusterReferenceName, string>,
    serviceMap: Map<NodeAlias, NetworkNodeServices>,
    clusterNodeIndexMap: Record<ClusterReferenceName, Record<NodeId, /* index in the chart -> */ number>>,
    newAccountNumber: string,
    nodeAlias: NodeAlias,
  ): void {
    for (const consensusNode of consensusNodes) {
      const clusterReference: string = consensusNode.cluster;
      const index: number = clusterNodeIndexMap[clusterReference][consensusNode.nodeId];

      valuesArgumentMap[clusterReference] +=
        newAccountNumber && consensusNode.name === nodeAlias
          ? ` --set "hedera.nodes[${index}].accountId=${newAccountNumber}"` +
            ` --set "hedera.nodes[${index}].name=${nodeAlias}"` +
            ` --set "hedera.nodes[${index}].nodeId=${consensusNode.nodeId}"`
          : ` --set "hedera.nodes[${index}].accountId=${serviceMap.get(consensusNode.name).accountId}"` +
            ` --set "hedera.nodes[${index}].name=${consensusNode.name}"` +
            ` --set "hedera.nodes[${index}].nodeId=${consensusNode.nodeId}"`;
    }
  }

  /**
   * Builds the values args for add:
   * - Adds the new node
   * - Keeps the rest the same
   */
  private prepareValuesArgForNodeAdd(
    consensusNodes: ConsensusNode[],
    valuesArgumentMap: Record<ClusterReferenceName, string>,
    serviceMap: Map<NodeAlias, NetworkNodeServices>,
    clusterNodeIndexMap: Record<ClusterReferenceName, Record<NodeId, /* index in the chart -> */ number>>,
    clusterReference: ClusterReferenceName,
    nodeId: NodeId,
    nodeAlias: NodeAlias,
    newNode: {accountId: string; name: NodeAlias},
    config: {
      haproxyIps?: string;
      haproxyIpsParsed?: Record<NodeAlias, IP>;
      envoyIps?: string;
      envoyIpsParsed?: Record<NodeAlias, IP>;
    },
  ): void {
    // Add existing nodes
    for (const node of consensusNodes) {
      if (node.name === nodeAlias) {
        continue;
      }
      const index: number = clusterNodeIndexMap[node.cluster][node.nodeId];

      valuesArgumentMap[node.cluster] +=
        ` --set "hedera.nodes[${index}].accountId=${serviceMap.get(node.name).accountId}"` +
        ` --set "hedera.nodes[${index}].name=${node.name}"` +
        ` --set "hedera.nodes[${index}].nodeId=${node.nodeId}"`;
    }

    // Add new node
    const index: number = clusterNodeIndexMap[clusterReference][nodeId];
    valuesArgumentMap[clusterReference] +=
      ` --set "hedera.nodes[${index}].accountId=${newNode.accountId}"` +
      ` --set "hedera.nodes[${index}].name=${newNode.name}"` +
      ` --set "hedera.nodes[${index}].nodeId=${nodeId}" `;

    // Set static IPs for HAProxy
    if (config.haproxyIps) {
      config.haproxyIpsParsed = Templates.parseNodeAliasToIpMapping(config.haproxyIps);
      const ip: string = config.haproxyIpsParsed?.[nodeAlias];
      if (ip) {
        valuesArgumentMap[clusterReference] += ` --set "hedera.nodes[${index}].haproxyStaticIP=${ip}"`;
      }
    }

    // Set static IPs for Envoy Proxy
    if (config.envoyIps) {
      config.envoyIpsParsed = Templates.parseNodeAliasToIpMapping(config.envoyIps);
      const ip: string = config.envoyIpsParsed?.[nodeAlias];
      if (ip) {
        valuesArgumentMap[clusterReference] += ` --set "hedera.nodes[${index}].envoyProxyStaticIP=${ip}"`;
      }
    }
  }

  /**
   * Builds the values args for delete:
   * - Remove the specified node
   * - Keeps the rest the same
   */
  private prepareValuesArgForNodeDestroy(
    consensusNodes: ConsensusNode[],
    valuesArgumentMap: Record<ClusterReferenceName, string>,
    nodeAlias: NodeAlias,
    serviceMap: Map<NodeAlias, NetworkNodeServices>,
    clusterReferences: ClusterReferences,
  ): void {
    for (const [clusterReference] of clusterReferences) {
      const nodesInCluster: ConsensusNode[] = consensusNodes
        .filter((node): boolean => node.cluster === clusterReference)
        // eslint-disable-next-line unicorn/no-array-sort
        .sort((a, b): number => a.nodeId - b.nodeId);

      let index: number = 0;

      for (const node of nodesInCluster) {
        // For nodes that are being deleted
        if (node.name === nodeAlias) {
          continue;
        }

        // For nodes that are not being deleted
        valuesArgumentMap[clusterReference] +=
          ` --set "hedera.nodes[${index}].accountId=${serviceMap.get(node.name).accountId}"` +
          ` --set "hedera.nodes[${index}].name=${node.name}"` +
          ` --set "hedera.nodes[${index}].nodeId=${node.nodeId}"`;

        index++;
      }
    }

    // now remove the deleted node from the serviceMap
    serviceMap.delete(nodeAlias);
  }

  public saveContextData(
    argv: ArgvStruct,
    targetFile: string,
    parser: (context_: AnyListrContext) => AnyObject,
  ): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext> {
    return {
      title: 'Save context data',
      task: context_ => {
        const outputDirectory = argv[flags.outputDir.name];
        if (!outputDirectory) {
          throw new SoloError(
            `Path to export context data not specified. Please set a value for --${flags.outputDir.name}`,
          );
        }

        if (!fs.existsSync(outputDirectory)) {
          fs.mkdirSync(outputDirectory, {recursive: true});
        }
        const exportedContext = parser(context_);
        fs.writeFileSync(PathEx.join(outputDirectory, targetFile), JSON.stringify(exportedContext));
      },
    };
  }

  public loadContextData(
    argv: ArgvStruct,
    targetFile: string,
    parser: (context_: AnyListrContext, contextData: AnyObject) => void,
  ): SoloListrTask<AnyListrContext> {
    return {
      title: 'Load context data',
      task: context_ => {
        const inputDirectory = argv[flags.inputDir.name];
        if (!inputDirectory) {
          throw new SoloError(`Path to context data not specified. Please set a value for --${flags.inputDir.name}`);
        }

        // @ts-expect-error - TS2345
        const contextData = JSON.parse(fs.readFileSync(PathEx.joinWithRealPath(inputDirectory, targetFile)));
        parser(context_, contextData);
      },
    };
  }

  public killNodes(transactionType?: NodeSubcommandType): SoloListrTask<NodeDestroyContext | NodeAddContext> {
    return {
      title: 'Kill nodes',
      task: async context_ => {
        const config = context_.config;
        for (const service of config.serviceMap.values()) {
          // skip pod if it's not in the list of config.allNodeAliases
          if (!config.allNodeAliases.includes(service.nodeAlias)) {
            continue;
          }
          await this.k8Factory
            .getK8(service.context)
            .pods()
            .readByReference(PodReference.of(config.namespace, service.nodePodName))
            .killPod();
        }

        // remove from remote config
        if (transactionType === NodeSubcommandType.DESTROY) {
          const nodeId: NodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);

          const componentId: ComponentId = Templates.renderComponentIdFromNodeId(nodeId);
          this.remoteConfig.configuration.components.removeComponent(componentId, ComponentTypes.ConsensusNode);
          this.remoteConfig.configuration.components.removeComponent(componentId, ComponentTypes.EnvoyProxy);
          this.remoteConfig.configuration.components.removeComponent(componentId, ComponentTypes.HaProxy);

          await this.remoteConfig.persist();

          context_.config.nodeAliases = config.allNodeAliases.filter(
            (nodeAlias: NodeAlias): boolean => nodeAlias !== config.nodeAlias,
          );
        }
      },
    };
  }

  public killNodesAndUpdateConfigMap(): SoloListrTask<NodeUpdateContext> {
    return {
      title: 'Kill nodes to pick up updated configMaps',
      task: async context_ => {
        const config = context_.config;
        const clusterReferences = this.remoteConfig.getClusterRefs();
        // the updated node will have a new pod ID if its account ID changed which is a label
        config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );

        for (const service of config.serviceMap.values()) {
          await this.k8Factory
            .getK8(service.context)
            .pods()
            .readByReference(PodReference.of(config.namespace, service.nodePodName))
            .killPod();
        }

        // again, the pod names will change after the pods are killed
        config.serviceMap = await this.accountManager.getNodeServiceMap(
          config.namespace,
          clusterReferences,
          config.deployment,
        );

        config.podRefs = {};
        for (const service of config.serviceMap.values()) {
          config.podRefs[service.nodeAlias] = PodReference.of(service.namespace, service.nodePodName);
        }
      },
    };
  }

  public checkNodePodsAreRunning(): SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext> {
    return {
      title: 'Check node pods are running',
      task: (context_, task) => {
        const config = context_.config;
        const subTasks: SoloListrTask<NodeUpdateContext | NodeAddContext | NodeDestroyContext>[] = [];

        for (const nodeAlias of config.allNodeAliases) {
          const context: Context = helpers.extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
          subTasks.push({
            title: `Check Node: ${chalk.yellow(nodeAlias)}`,
            task: async (): Promise<void> => {
              await this.k8Factory
                .getK8(context)
                .pods()
                .waitForRunningPhase(
                  config.namespace,
                  [`solo.hedera.com/node-name=${nodeAlias}`, 'solo.hedera.com/type=network-node'],
                  constants.PODS_RUNNING_MAX_ATTEMPTS,
                  constants.PODS_RUNNING_DELAY,
                ); // timeout 15 minutes
            },
          });
        }

        // set up the sub-tasks
        return task.newListr(subTasks, {concurrent: true, rendererOptions: {collapseSubtasks: false}});
      },
    };
  }

  public sleep(title: string, milliseconds: number): SoloListrTask<AnyListrContext> {
    return {
      title,
      task: async () => {
        await sleep(Duration.ofMillis(milliseconds));
      },
    };
  }

  public downloadLastState(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Download last state from an existing node',
      task: async ({config}): Promise<void> => {
        const {consensusNodes, namespace, stagingDir} = config;

        // TODO: currently only supports downloading from the first existing node
        const node: ConsensusNode = consensusNodes[0];
        const upgradeDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/0/123`;

        const container: Container = await this.k8Factory
          .getK8(node.context)
          .helpers()
          .getConsensusNodeRootContainer(namespace, node.name);

        // Use the -X to archive for cross-platform compatibility
        const archiveCommand: string =
          'cd "${states[0]}" && zip -rX "${states[0]}.zip" . >/dev/null && sleep 1 && cd ../ && mv "${states[0]}/${states[0]}.zip" "${states[0]}.zip"';

        // zip the contents of the newest folder on node1 within /opt/hgcapp/services-hedera/HapiApp2.0/data/saved/com.hedera.services.ServicesMain/0/123/
        const zipFileName: string = await container.execContainer([
          'bash',
          '-c',
          `cd ${upgradeDirectory} && mapfile -t states < <(ls -1 . | sort -nr) && ${archiveCommand} && echo -n \${states[0]}.zip`,
        ]);

        this.logger.debug(`state zip file to download is = ${zipFileName}`);

        await container.copyFrom(`${upgradeDirectory}/${zipFileName}`, stagingDir);

        config.lastStateZipPath = PathEx.joinWithRealPath(stagingDir, zipFileName);
      },
    };
  }

  public uploadStateToNewNode(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Upload last saved state to new network node',
      task: async context_ => {
        const config = context_.config;
        const nodeAlias = config.nodeAlias || config.nodeAliases[0];
        const newNodeFullyQualifiedPodName = Templates.renderNetworkPodName(nodeAlias);
        const podReference = PodReference.of(config.namespace, newNodeFullyQualifiedPodName);
        const containerReference = ContainerReference.of(podReference, constants.ROOT_CONTAINER);
        const nodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
        const savedStateDirectory = config.lastStateZipPath.match(/\/(\d+)\.zip$/)[1];
        const savedStatePath = `${constants.HEDERA_HAPI_PATH}/data/saved/com.hedera.services.ServicesMain/${nodeId}/123/${savedStateDirectory}`;

        const context = helpers.extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
        const k8 = this.k8Factory.getK8(context);

        const container = k8.containers().readByRef(containerReference);

        await container.execContainer(['bash', '-c', `mkdir -p ${savedStatePath}`]);
        await k8.containers().readByRef(containerReference).copyTo(config.lastStateZipPath, savedStatePath);

        await this.platformInstaller.setPathPermission(
          podReference,
          constants.HEDERA_HAPI_PATH,
          undefined,
          undefined,
          undefined,
          context,
        );

        const extractCommand = `unzip ${path.basename(config.lastStateZipPath)}`;

        await k8
          .containers()
          .readByRef(containerReference)
          .execContainer([
            'bash',
            '-c',
            `cd ${savedStatePath} && ${extractCommand} && mv preconsensus-events/0 preconsensus-events/${nodeId} && rm -f ${path.basename(config.lastStateZipPath)}`,
          ]);
      },
    };
  }

  public sendNodeDeleteTransaction(): SoloListrTask<NodeDestroyContext> {
    return {
      title: 'Send node delete transaction',
      task: async context_ => {
        const config: NodeDestroyConfigClass = context_.config;

        try {
          const deploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
          const accountMap = this.accountManager.getNodeAccountMap(config.existingNodeAliases, deploymentName);
          const deleteAccountId = accountMap.get(config.nodeAlias);
          this.logger.debug(`Deleting node: ${config.nodeAlias} with account: ${deleteAccountId}`);

          const nodeId: NodeId = Templates.nodeIdFromNodeAlias(config.nodeAlias);

          const nodeDeleteTransaction: NodeDeleteTransaction = new NodeDeleteTransaction()
            .setNodeId(new Long(nodeId))
            .freezeWith(config.nodeClient);

          const signedTransaction: NodeDeleteTransaction = await nodeDeleteTransaction.sign(config.adminKey);
          const transactionResponse: TransactionResponse = await signedTransaction.execute(config.nodeClient);
          const nodeDeleteReceipt: TransactionReceipt = await transactionResponse.getReceipt(config.nodeClient);

          this.logger.debug(`NodeDeleteReceipt: ${nodeDeleteReceipt.toString()}`);

          if (nodeDeleteReceipt.status !== Status.Success) {
            throw new SoloError(`Node delete transaction failed with status: ${nodeDeleteReceipt.status}.`);
          }

          // Delete admin key secret from k8s after successful node deletion
          try {
            const context: string = helpers.extractContextFromConsensusNodes(config.nodeAlias, config.consensusNodes);
            await this.k8Factory
              .getK8(context)
              .secrets()
              .delete(config.namespace, Templates.renderNodeAdminKeyName(config.nodeAlias));
            this.logger.debug(`Deleted admin key secret for node ${config.nodeAlias} from k8s`);
          } catch (deleteError) {
            // Log but don't fail the delete operation if secret doesn't exist or can't be deleted
            this.logger.debug(`Could not delete admin key secret for ${config.nodeAlias}: ${deleteError.message}`);
          }
        } catch (error) {
          throw new SoloError(`Error deleting node from network: ${error.message}`, error);
        }
      },
    };
  }

  public sendNodeCreateTransaction(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Send node create transaction',
      task: async context_ => {
        const config: NodeAddConfigClass = context_.config;

        try {
          const nodeCreateTransaction: NodeCreateTransaction = new NodeCreateTransaction()
            .setAccountId(context_.newNode.accountId)
            .setGossipEndpoints(context_.gossipEndpoints)
            .setServiceEndpoints(context_.grpcServiceEndpoints)
            .setGossipCaCertificate(context_.signingCertDer)
            .setCertificateHash(context_.tlsCertHash)
            .setAdminKey(context_.adminKey.publicKey)
            .freezeWith(config.nodeClient);

          const signedTransaction: NodeCreateTransaction = await nodeCreateTransaction.sign(context_.adminKey);
          const txResp: TransactionResponse = await signedTransaction.execute(config.nodeClient);
          const nodeCreateReceipt: TransactionReceipt = await txResp.getReceipt(config.nodeClient);

          this.logger.debug(`NodeCreateReceipt: ${nodeCreateReceipt.toString()}`);

          if (nodeCreateReceipt.status !== Status.Success) {
            throw new SoloError(`Node Create Transaction failed: ${nodeCreateReceipt.status}`);
          }

          // Save admin key to k8s secret after successful node creation
          // nodeAlias was set in determineNewNodeAccountNumber step
          const nodeAlias: NodeAlias = config.nodeAlias;
          const context: string = helpers.extractContextFromConsensusNodes(nodeAlias, config.consensusNodes);
          const data: {privateKey: string; publicKey: string} = {
            privateKey: Base64.encode(context_.adminKey.toString()),
            publicKey: Base64.encode(context_.adminKey.publicKey.toString()),
          };

          await this.k8Factory
            .getK8(context)
            .secrets()
            .createOrReplace(config.namespace, Templates.renderNodeAdminKeyName(nodeAlias), SecretType.OPAQUE, data, {
              'solo.hedera.com/node-admin-key': 'true',
            });

          this.logger.debug(`Saved admin key for node ${nodeAlias} to k8s secret`);
        } catch (error) {
          throw new SoloError(`Error adding node to network: ${error.message}`, error);
        }
      },
    };
  }

  public initialize(
    argv: ArgvStruct,
    configInit: ConfigBuilder,
    lease: Lock | null,
    shouldLoadNodeClient: boolean = true,
  ): SoloListrTask<AnyListrContext> {
    // eslint-disable-next-line @typescript-eslint/typedef,unicorn/no-this-assignment
    const self = this;
    const {required, optional} = argv;
    argv.flags = [...required, ...optional];

    return {
      title: 'Initialize',
      task: async (context_, task): Promise<SoloListr<AnyListrContext> | void> => {
        await self.localConfig.load();
        await self.remoteConfig.loadAndValidate(argv);

        if (argv[flags.devMode.name]) {
          this.logger.setDevMode(true);
        }

        this.configManager.update(argv);

        // disable the prompts that we don't want to prompt the user for
        flags.disablePrompts(optional);

        const flagsToPrompt = [];
        for (const pFlag of required) {
          if (argv[pFlag.name] === undefined) {
            flagsToPrompt.push(pFlag);
          }
        }

        await this.configManager.executePrompt(task, flagsToPrompt);

        const config = await configInit(argv, context_, task, shouldLoadNodeClient);
        context_.config = config;
        config.consensusNodes = this.remoteConfig.getConsensusNodes();
        config.contexts = this.remoteConfig.getContexts();

        for (const flag of required) {
          if (config[flag.constName] === undefined) {
            throw new MissingArgumentError(`No value set for required flag: ${flag.name}`, flag.name);
          }
        }

        if (lease) {
          return ListrLock.newAcquireLockTask(lease, task);
        }
      },
    };
  }

  public addNewConsensusNodeToRemoteConfig(): SoloListrTask<NodeAddContext> {
    return {
      title: 'Add new node to remote config',
      task: async (context_, task): Promise<void> => {
        const nodeAlias: NodeAlias = context_.config.nodeAlias;
        const nodeId: NodeId = Templates.nodeIdFromNodeAlias(nodeAlias);
        const namespace: NamespaceName = context_.config.namespace;
        const clusterReference: ClusterReferenceName = context_.config.clusterRef;
        const context: Context = this.localConfig.configuration.clusterRefs.get(clusterReference)?.toString();

        task.title += `: ${nodeAlias}`;

        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewConsensusNodeComponent(
            Templates.renderComponentIdFromNodeId(nodeId),
            clusterReference,
            namespace,
            DeploymentPhase.STARTED,
          ),
          ComponentTypes.ConsensusNode,
        );

        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewEnvoyProxyComponent(clusterReference, namespace),
          ComponentTypes.EnvoyProxy,
        );

        this.remoteConfig.configuration.components.addNewComponent(
          this.componentFactory.createNewHaProxyComponent(clusterReference, namespace),
          ComponentTypes.HaProxy,
        );

        await this.remoteConfig.persist();

        context_.config.consensusNodes = this.remoteConfig.getConsensusNodes();

        // if the consensusNodes does not contain the nodeAlias then add it
        if (!context_.config.consensusNodes.some((node): boolean => node.name === nodeAlias)) {
          const cluster: ClusterSchema = this.remoteConfig.configuration.clusters.find(
            (cluster): boolean => cluster.name === clusterReference,
          );

          context_.config.consensusNodes.push(
            new ConsensusNode(
              nodeAlias,
              nodeId,
              namespace.name,
              clusterReference,
              context.toString(),
              cluster.dnsBaseDomain,
              cluster.dnsConsensusNodePattern,
              Templates.renderConsensusNodeFullyQualifiedDomainName(
                nodeAlias,
                nodeId,
                namespace.name,
                clusterReference,
                cluster.dnsBaseDomain,
                cluster.dnsConsensusNodePattern,
              ),
              [],
            ),
          );
        }
      },
    };
  }

  public downloadHieroComponentLogs(customOutputDirectory: string = ''): SoloListrTask<AnyListrContext> {
    return {
      title: 'Download logs from Hiero components',
      task: async (_, task) => {
        // Iterate all k8 contexts to find solo-remote-config configmaps
        this.logger.info('Discovering Hiero components from remote configuration...');
        const contexts: Contexts = this.k8Factory.default().contexts();
        const allPods: Array<{pod: Pod; context: string; namespace: NamespaceName}> = [];

        // Define component types and their label selectors
        const componentLabelConfigs: Array<{name: string; labels: string[]}> = [
          {name: 'mirror importer', labels: [constants.SOLO_MIRROR_IMPORTER_NAME_LABEL]},
          {name: 'mirror grpc', labels: [constants.SOLO_MIRROR_GRPC_NAME_LABEL]},
          {name: 'mirror monitor', labels: [constants.SOLO_MIRROR_MONITOR_NAME_LABEL]},
          {name: 'mirror rest', labels: [constants.SOLO_MIRROR_REST_NAME_LABEL]},
          {name: 'mirror web3', labels: [constants.SOLO_MIRROR_WEB3_NAME_LABEL]},
          {name: 'mirror postgres', labels: [constants.SOLO_MIRROR_POSTGRES_NAME_LABEL]},
          {name: 'mirror redis', labels: [constants.SOLO_MIRROR_REDIS_NAME_LABEL]},
          {name: 'mirror rest-java', labels: [constants.SOLO_MIRROR_RESTJAVA_NAME_LABEL]},
          {name: 'relay node', labels: [constants.SOLO_RELAY_NAME_LABEL]},
          {name: 'explorer', labels: [constants.SOLO_EXPLORER_LABEL]},
          {name: 'block node', labels: [constants.SOLO_BLOCK_NODE_NAME_LABEL]},
          {name: 'ingress controller', labels: [constants.SOLO_INGRESS_CONTROLLER_NAME_LABEL]},
        ];

        // Create output directory structure - use custom dir if provided, otherwise use default
        const outputDirectory: string = customOutputDirectory
          ? path.resolve(customOutputDirectory)
          : path.join(constants.SOLO_LOGS_DIR, 'hiero-components-logs');
        if (!fs.existsSync(outputDirectory)) {
          fs.mkdirSync(outputDirectory, {recursive: true});
        }

        for (const context of contexts.list()) {
          const k8: K8 = this.k8Factory.getK8(context);

          try {
            this.logger.info(`Discovering Hiero component pods in context: ${context}...`);

            // Iterate through each component type and discover pods
            for (const config of componentLabelConfigs) {
              const pods: Pod[] = await k8.pods().listForAllNamespaces(config.labels);
              this.logger.info(`Found ${pods.length} ${config.name} pod(s) in context ${context}`);

              for (const pod of pods) {
                const newPodInfo: {pod: Pod; context: string; namespace: NamespaceName} = {
                  pod,
                  context: context,
                  namespace: pod.podReference.namespace,
                };
                allPods.push(newPodInfo);
                // If it is block node pod, download *.log files from '/opt/hiero/block-node/logs'
                if ('block node' === config.name) {
                  await this.downloadBlockNodeLogFiles(newPodInfo, outputDirectory);
                }
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to discover pods in context ${context}: ${error}`);
          }
        }

        this.logger.info(`Logs will be saved to: ${outputDirectory}`);
        this.logger.info(`Found ${allPods.length} Hiero component pods`);
        // Download logs from each pod
        for (const podInfo of allPods) {
          await this.downloadPodLogs(podInfo, outputDirectory);
        }

        task.title = `Downloaded logs from ${allPods.length} Hiero component pods`;
      },
    };
  }

  private async downloadPodLogs(
    podInfo: {pod: Pod; context: string; namespace: NamespaceName},
    outputDirectory: string,
  ): Promise<void> {
    const {pod, context, namespace}: {pod: Pod; context: string; namespace: NamespaceName} = podInfo;
    const podName: string = pod.podReference.name.name;

    this.logger.info(`Downloading logs from pod: ${podName} (cluster: ${context})`);

    try {
      // Create directory for this pod's logs
      const podLogDirectory: string = path.join(outputDirectory, context);
      if (!fs.existsSync(podLogDirectory)) {
        fs.mkdirSync(podLogDirectory, {recursive: true});
      }

      // Get logs using kubectl with output to file (avoids buffer issues)
      const logFile: string = path.join(podLogDirectory, `${podName}.log`);
      const logCommand: string = `kubectl logs ${podName} -n ${namespace.toString()} --all-containers=true --timestamps=true > "${logFile}" 2>&1`;

      this.logger.info(`Downloading logs for pod ${podName}...`);

      try {
        execSync(logCommand, {encoding: 'utf8', cwd: process.cwd(), shell: '/bin/bash', maxBuffer: 1024 * 1024 * 100}); // 100MB buffer
        this.logger.info(`Saved logs to ${logFile}`);
      } catch {
        // Try without all-containers flag if that fails
        const simpleLogCommand: string = `kubectl logs ${podName} -n ${namespace.toString()} --timestamps=true > "${logFile}" 2>&1`;
        execSync(simpleLogCommand, {
          encoding: 'utf8',
          cwd: process.cwd(),
          shell: '/bin/bash',
          maxBuffer: 1024 * 1024 * 100,
        });
        this.logger.info(`Saved logs to ${logFile}`);
      }
    } catch (error) {
      this.logger.showUser(red(`Failed to download logs from pod ${podName}: ${error}`));
      this.logger.error(`Failed to download logs from pod ${podName}: ${error}`);
      // Continue with other pods even if one fails
    }
  }

  private async downloadBlockNodeLogFiles(
    podInfo: {pod: Pod; context: string; namespace: NamespaceName},
    outputDirectory: string,
  ): Promise<void> {
    const {pod, context}: {pod: Pod; context: string; namespace: NamespaceName} = podInfo;
    const podName: string = pod.podReference.name.name;

    this.logger.info(`Downloading block node log files from ${podName}...`);

    try {
      const k8: K8 = this.k8Factory.getK8(context);
      const containerReference: ContainerReference = ContainerReference.of(pod.podReference, constants.ROOT_CONTAINER);
      const container: Container = k8.containers().readByRef(containerReference);

      // Create directory for block node log files
      const blockNodeLogDirectory: string = path.join(outputDirectory, context, `${podName}-block-logs`);
      if (!fs.existsSync(blockNodeLogDirectory)) {
        fs.mkdirSync(blockNodeLogDirectory, {recursive: true});
      }

      await container.copyFrom('/opt/hiero/block-node/logs/*.log', blockNodeLogDirectory);
    } catch (error) {
      this.logger.error(`Failed to download block node log files from ${podName}: ${error}`);
    }
  }
}
