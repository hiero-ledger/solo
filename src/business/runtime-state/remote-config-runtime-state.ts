// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type ObjectMapper} from '../../data/mapper/api/object-mapper.js';
import {ClassToObjectMapper} from '../../data/mapper/impl/ct-object-mapper.js';
import {ConfigKeyFormatter} from '../../data/key/config-key-formatter.js';
import {ApplicationVersions} from '../../data/schema/model/common/application-versions.js';
import {ReadRemoteConfigBeforeLoadError} from '../errors/read-remote-config-before-load-error.js';
import {WriteRemoteConfigBeforeLoadError} from '../errors/write-remote-config-before-load-error.js';
import {RemoteConfigSource} from '../../data/configuration/impl/remote-config-source.js';
import {RemoteConfigSchema} from '../../data/schema/migration/impl/remote/remote-config-schema.js';
import {YamlConfigMapStorageBackend} from '../../data/backend/impl/yaml-config-map-storage-backend.js';
import {type ConfigMap} from '../../integration/kube/resources/config-map/config-map.js';
import {RemoteConfigMetadata} from '../../data/schema/model/remote/remote-config-metadata.js';
import {Cluster} from '../../data/schema/model/common/cluster.js';
import {DeploymentState} from '../../data/schema/model/remote/deployment-state.js';
import {DeploymentHistory} from '../../data/schema/model/remote/deployment-history.js';
import {RemoteConfig} from '../../data/schema/model/remote/remote-config.js';
import {UserIdentity} from '../../data/schema/model/common/user-identity.js';
import {LedgerPhase} from '../../data/schema/model/remote/ledger-phase.js';
import {ConsensusNodeState} from '../../data/schema/model/remote/state/consensus-node-state.js';
import {SemVer} from 'semver';
import {ComponentsDataWrapperApi} from '../../core/config/remote/api/components-data-wrapper-api.js';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {LocalConfigRuntimeState} from './local-config-runtime-state.js';
import {type ConfigManager} from '../../core/config-manager.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ComponentsDataWrapper} from '../../core/config/remote/components-data-wrapper.js';
import {
  type ClusterReference,
  type ClusterReferences,
  type Context,
  type DeploymentName,
  type NamespaceNameAsString,
} from '../../types/index.js';
import {type AnyObject, type ArgvStruct, type NodeAlias, type NodeAliases} from '../../types/aliases.js';
import {NamespaceName} from '../../types/namespace/namespace-name.js';
import {ComponentStateMetadata} from '../../data/schema/model/remote/state/component-state-metadata.js';
import {Templates} from '../../core/templates.js';
import {DeploymentPhase} from '../../data/schema/model/remote/deployment-phase.js';
import {getSoloVersion} from '../../../version.js';
import * as constants from '../../core/constants.js';
import {SoloError} from '../../core/errors/solo-error.js';
import {Flags as flags} from '../../commands/flags.js';
import {Deployment} from '../../data/schema/model/local/deployment.js';
import {promptTheUserForDeployment} from '../../core/resolvers.js';
import {ConsensusNode} from '../../core/model/consensus-node.js';
import {RemoteConfigRuntimeStateApi} from './api/remote-config-runtime-state-api.js';
import {type RemoteConfigValidatorApi} from '../../core/config/remote/api/remote-config-validator-api.js';

enum RuntimeStatePhase {
  Loaded = 'loaded',
  NotLoaded = 'not_loaded',
}

@injectable()
export class RemoteConfigRuntimeState implements RemoteConfigRuntimeStateApi {
  private phase: RuntimeStatePhase = RuntimeStatePhase.NotLoaded;

  private componentsDataWrapper?: ComponentsDataWrapperApi;
  public clusterReferences: Map<Context, ClusterReference> = new Map();

  private source?: RemoteConfigSource;
  private backend?: YamlConfigMapStorageBackend;
  private objectMapper?: ObjectMapper;

  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig?: LocalConfigRuntimeState,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
    @inject(InjectTokens.RemoteConfigValidator) private readonly remoteConfigValidator?: RemoteConfigValidatorApi,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
  }

  public get currentCluster(): ClusterReference {
    return this.k8Factory.default().clusters().readCurrent();
  }

  public get components(): ComponentsDataWrapperApi {
    this.failIfNotLoaded();
    return this.componentsDataWrapper;
  }

  public get schemaVersion(): number {
    this.failIfNotLoaded();
    return this.source.modelData.schemaVersion;
  }

  public get metadata(): Readonly<RemoteConfigMetadata> {
    this.failIfNotLoaded();
    return this.source.modelData.metadata;
  }

  public get versions(): Readonly<ApplicationVersions> {
    this.failIfNotLoaded();
    return this.source.modelData.versions;
  }

  public get clusters(): Readonly<Readonly<Cluster>[]> {
    this.failIfNotLoaded();
    return this.source.modelData.clusters;
  }

  public get state(): Readonly<DeploymentState> {
    this.failIfNotLoaded();
    return this.source.modelData.state;
  }

  public get history(): Readonly<DeploymentHistory> {
    this.failIfNotLoaded();
    return this.source.modelData.history;
  }

  public async load(namespace?: NamespaceName, context?: Context): Promise<void> {
    if (this.isLoaded()) {
      return;
    }

    const configMap: ConfigMap = await this.getConfigMap(namespace, context);
    await this.populateRemoteConfig(configMap);
  }

  public async populateRemoteConfig(configMap: ConfigMap): Promise<void> {
    this.backend = new YamlConfigMapStorageBackend(configMap);
    this.objectMapper = new ClassToObjectMapper(ConfigKeyFormatter.instance());
    this.source = new RemoteConfigSource(new RemoteConfigSchema(this.objectMapper), this.objectMapper, this.backend);
    this.phase = RuntimeStatePhase.Loaded;
  }

  public async write(): Promise<void> {
    return this.source.persist();
  }

  public isLoaded(): boolean {
    return this.phase === RuntimeStatePhase.Loaded;
  }

  private failIfNotLoaded(): void {
    if (!this.isLoaded()) {
      throw new ReadRemoteConfigBeforeLoadError('Attempting to read from remote config before loading it');
    }
  }

  public async modify(
    callback: (remoteConfig: RemoteConfig, components: ComponentsDataWrapperApi) => Promise<void>,
  ): Promise<void> {
    if (!this.isLoaded()) {
      throw new WriteRemoteConfigBeforeLoadError('Attempting to modify remote config before loading it');
    }
    await callback(this.source.modelData, this.components);

    return this.write();
  }

  public async create(
    argv: ArgvStruct,
    ledgerPhase: LedgerPhase,
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deployment: DeploymentName,
    clusterReference: ClusterReference,
    context: Context,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): Promise<void> {
    const configMap: ConfigMap = await this.createConfigMap(namespace, context);

    const consensusNodeStates: ConsensusNodeState[] = nodeAliases.map((nodeAlias: NodeAlias): ConsensusNodeState => {
      return new ConsensusNodeState(
        new ComponentStateMetadata(
          Templates.nodeIdFromNodeAlias(nodeAlias),
          namespace.name,
          clusterReference,
          DeploymentPhase.REQUESTED,
        ),
      );
    });

    const userIdentity: Readonly<UserIdentity> = this.localConfig.userIdentity;
    const cliVersion: SemVer = new SemVer(getSoloVersion());
    const command: string = argv._.join(' ');

    const cluster: Cluster = new Cluster(
      clusterReference,
      namespace.name,
      deployment,
      dnsBaseDomain,
      dnsConsensusNodePattern,
    );

    await this.populateRemoteConfig(configMap);

    const remoteConfig: RemoteConfig = new RemoteConfig(
      undefined,
      new RemoteConfigMetadata(new Date(), userIdentity),
      new ApplicationVersions(cliVersion),
      [cluster],
      new DeploymentState(ledgerPhase, consensusNodeStates),
      new DeploymentHistory([command], command),
    );

    await this.backend.writeObject('' /* TODO */, this.objectMapper.toObject(remoteConfig));

    this.componentsDataWrapper = new ComponentsDataWrapper(this);
  }

  public addCommandToHistory(command: string, remoteConfig: RemoteConfig): void {
    remoteConfig.history.commands.push(command);
    remoteConfig.history.lastExecutedCommand = command;

    if (remoteConfig.history.commands.length > constants.SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY) {
      remoteConfig.history.commands.shift();
    }
  }

  public async createConfigMap(namespace: NamespaceName, context: Context): Promise<ConfigMap> {
    const name: string = constants.SOLO_REMOTE_CONFIGMAP_NAME;
    const labels: Record<string, string> = constants.SOLO_REMOTE_CONFIGMAP_LABELS;
    await this.k8Factory.getK8(context).configMaps().create(namespace, name, labels, {});
    return await this.k8Factory.getK8(context).configMaps().read(namespace, name);
  }

  public async getConfigMap(namespace?: NamespaceName, context?: Context): Promise<ConfigMap> {
    const configMap: ConfigMap = await this.k8Factory
      .getK8(context)
      .configMaps()
      .read(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);

    if (!configMap) {
      throw new SoloError(`Remote config ConfigMap not found for namespace: ${namespace}, context: ${context}`);
    }

    return configMap;
  }

  /**
   * Performs the loading of the remote configuration.
   * Checks if the configuration is already loaded, otherwise loads and adds the command to history.
   *
   * @param argv - arguments containing command input for historical reference.
   * @param validate - whether to validate the remote configuration.
   * @param [skipConsensusNodesValidation] - whether or not to validate the consensusNodes
   */
  public async loadAndValidate(
    argv: {_: string[]} & AnyObject,
    validate: boolean = true,
    skipConsensusNodesValidation: boolean = true,
  ): Promise<void> {
    await this.setDefaultNamespaceAndDeploymentIfNotSet(argv);
    this.setDefaultContextIfNotSet();

    const deployment: Deployment = this.localConfig.getDeployment(
      this.configManager.getFlag<DeploymentName>(flags.deployment),
    );

    const namespace: NamespaceName = NamespaceName.of(deployment.namespace);

    for (const clusterReference of deployment.clusters) {
      const context: Context = this.localConfig.clusterRefs.get(clusterReference);
      this.clusterReferences.set(context, clusterReference);
    }

    await this.load(namespace, context);

    this.logger.info('Remote config loaded');
    if (!validate) {
      return;
    }

    await this.remoteConfigValidator.validateComponents(namespace, skipConsensusNodesValidation);

    await this.modify(async (remoteConfig: RemoteConfig) => {
      const currentCommand: string = argv._?.join(' ');
      const commandArguments: string = flags.stringifyArgv(argv);

      this.addCommandToHistory(
        `Executed by ${this.localConfig.userIdentity.name}: ${currentCommand} ${commandArguments}`.trim(),
        remoteConfig,
      );

      this.populateVersionsInMetadata(argv, remoteConfig);
    });
  }

  private populateVersionsInMetadata(argv: AnyObject, remoteConfig: RemoteConfig): void {
    const command: string = argv._[0];
    const subcommand: string = argv._[1];

    const isCommandUsingSoloChartVersionFlag: boolean =
      (command === 'network' && subcommand === 'deploy') ||
      (command === 'network' && subcommand === 'refresh') ||
      (command === 'node' && subcommand === 'update') ||
      (command === 'node' && subcommand === 'update-execute') ||
      (command === 'node' && subcommand === 'add') ||
      (command === 'node' && subcommand === 'add-execute') ||
      (command === 'node' && subcommand === 'delete') ||
      (command === 'node' && subcommand === 'delete-execute');

    if (argv[flags.soloChartVersion.name]) {
      remoteConfig.versions.cli = new SemVer(argv[flags.soloChartVersion.name]);
    } else if (isCommandUsingSoloChartVersionFlag) {
      remoteConfig.versions.cli = new SemVer(flags.soloChartVersion.definition.defaultValue as string);
    }

    const isCommandUsingReleaseTagVersionFlag: boolean =
      (command === 'node' && subcommand !== 'keys' && subcommand !== 'logs' && subcommand !== 'states') ||
      (command === 'network' && subcommand === 'deploy');

    if (argv[flags.releaseTag.name]) {
      remoteConfig.versions.consensusNode = new SemVer(argv[flags.releaseTag.name]);
    } else if (isCommandUsingReleaseTagVersionFlag) {
      remoteConfig.versions.consensusNode = new SemVer(flags.releaseTag.definition.defaultValue as string);
    }

    if (argv[flags.mirrorNodeVersion.name]) {
      remoteConfig.versions.mirrorNodeChart = new SemVer(argv[flags.mirrorNodeVersion.name]);
    } else if (command === 'mirror-node' && subcommand === 'deploy') {
      remoteConfig.versions.mirrorNodeChart = new SemVer(flags.mirrorNodeVersion.definition.defaultValue as string);
    }

    if (argv[flags.hederaExplorerVersion.name]) {
      remoteConfig.versions.explorerChart = new SemVer(argv[flags.hederaExplorerVersion.name]);
    } else if (command === 'explorer' && subcommand === 'deploy') {
      remoteConfig.versions.explorerChart = new SemVer(flags.hederaExplorerVersion.definition.defaultValue as string);
    }

    if (argv[flags.relayReleaseTag.name]) {
      remoteConfig.versions.jsonRpcRelayChart = new SemVer(argv[flags.relayReleaseTag.name]);
    } else if (command === 'relay' && subcommand === 'deploy') {
      remoteConfig.versions.jsonRpcRelayChart = new SemVer(flags.relayReleaseTag.definition.defaultValue as string);
    }
  }

  public async deleteComponents(): Promise<void> {
    await this.modify(async (remoteConfig, components) => {
      remoteConfig.state = new DeploymentState();
      components.state = remoteConfig.state;
    });
  }

  private async setDefaultNamespaceAndDeploymentIfNotSet(argv: AnyObject): Promise<void> {
    if (this.configManager.hasFlag(flags.namespace)) {
      return;
    }

    // TODO: Current quick fix for commands where namespace is not passed
    let deploymentName: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    let currentDeployment: Deployment = this.localConfig.getDeployment(deploymentName);

    if (!deploymentName) {
      deploymentName = await promptTheUserForDeployment(this.configManager);
      currentDeployment = this.localConfig.getDeployment(deploymentName);
      // TODO: Fix once we have the DataManager,
      //       without this the user will be prompted a second time for the deployment
      // TODO: we should not be mutating argv
      argv[flags.deployment.name] = deploymentName;
      this.logger.warn(
        `Deployment name not found in flags or local config, setting it in argv and config manager to: ${deploymentName}`,
      );
      this.configManager.setFlag(flags.deployment, deploymentName);
    }

    if (!currentDeployment) {
      throw new SoloError(`Selected deployment name is not set in local config - ${deploymentName}`);
    }

    const namespace: NamespaceNameAsString = currentDeployment.namespace;

    this.logger.warn(`Namespace not found in flags, setting it to: ${namespace}`);
    this.configManager.setFlag(flags.namespace, namespace);
    argv[flags.namespace.name] = namespace;
  }

  private setDefaultContextIfNotSet(): void {
    if (this.configManager.hasFlag(flags.context)) {
      return;
    }

    const context: Context = this.getContextForFirstCluster() ?? this.k8Factory.default().contexts().readCurrent();

    if (!context) {
      throw new SoloError("Context is not passed and default one can't be acquired");
    }

    this.logger.warn(`Context not found in flags, setting it to: ${context}`);
    this.configManager.setFlag(flags.context, context);
  }

  //* Common Commands

  /**
   * Get the consensus nodes from the remoteConfig and use the localConfig to get the context
   * @returns an array of ConsensusNode objects
   */
  public getConsensusNodes(): ConsensusNode[] {
    if (!this.isLoaded()) {
      throw new SoloError('Remote configuration is not loaded, and was expected to be loaded');
    }

    const consensusNodes: ConsensusNode[] = [];

    for (const node of Object.values(this.state.consensusNodes)) {
      const cluster: Cluster = this.clusters.find(
        (cluster: Cluster): boolean => cluster.name === node.metadata.cluster,
      );
      const context: Context = this.localConfig.clusterRefs.get(node.metadata.cluster);
      const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(node.metadata.id + 1);

      consensusNodes.push(
        new ConsensusNode(
          nodeAlias,
          node.metadata.id,
          node.metadata.namespace,
          node.metadata.cluster,
          context,
          cluster.dnsBaseDomain,
          cluster.dnsConsensusNodePattern,
          Templates.renderConsensusNodeFullyQualifiedDomainName(
            nodeAlias,
            node.metadata.id,
            node.metadata.namespace,
            node.metadata.cluster,
            cluster.dnsBaseDomain,
            cluster.dnsConsensusNodePattern,
          ),
        ),
      );
    }

    // return the consensus nodes
    return consensusNodes;
  }

  /**
   * Gets a list of distinct contexts from the consensus nodes.
   * @returns an array of context strings.
   */
  public getContexts(): Context[] {
    return [...new Set(this.getConsensusNodes().map((node): Context => node.context))];
  }

  /**
   * Gets a list of distinct cluster references from the consensus nodes.
   * @returns an object of cluster references.
   */
  public getClusterRefs(): ClusterReferences {
    const nodes: ConsensusNode[] = this.getConsensusNodes();
    const accumulator: ClusterReferences = new Map<string, string>();

    for (const node of nodes) {
      accumulator.set(node.cluster, node.context);
    }

    return accumulator;
  }

  private getContextForFirstCluster(): string {
    const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);

    const clusterReference: ClusterReference = this.localConfig.getDeployment(deploymentName).clusters[0];

    const context: Context = this.localConfig.clusterRefs.get(clusterReference);

    this.logger.debug(`Using context ${context} for cluster ${clusterReference} for deployment ${deploymentName}`);

    return context;
  }
}
