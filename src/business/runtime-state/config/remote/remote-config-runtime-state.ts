// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type ObjectMapper} from '../../../../data/mapper/api/object-mapper.js';
import {ReadRemoteConfigBeforeLoadError} from '../../../errors/read-remote-config-before-load-error.js';
import {WriteRemoteConfigBeforeLoadError} from '../../../errors/write-remote-config-before-load-error.js';
import {RemoteConfigSource} from '../../../../data/configuration/impl/remote-config-source.js';
import {YamlConfigMapStorageBackend} from '../../../../data/backend/impl/yaml-config-map-storage-backend.js';
import {type ConfigMap} from '../../../../integration/kube/resources/config-map/config-map.js';
import {LedgerPhase} from '../../../../data/schema/model/remote/ledger-phase.js';
import {eq, SemVer} from 'semver';
import {ComponentsDataWrapperApi} from '../../../../core/config/remote/api/components-data-wrapper-api.js';
import {InjectTokens} from '../../../../core/dependency-injection/inject-tokens.js';
import {type K8Factory} from '../../../../integration/kube/k8-factory.js';
import {type SoloLogger} from '../../../../core/logging/solo-logger.js';
import {type ConfigManager} from '../../../../core/config-manager.js';
import {patchInject} from '../../../../core/dependency-injection/container-helper.js';
import {
  type ClusterReferenceName,
  type ClusterReferences,
  type Context,
  type DeploymentName,
  type NamespaceNameAsString,
  Optional,
} from '../../../../types/index.js';
import {
  type AnyObject,
  type ArgvStruct,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
} from '../../../../types/aliases.js';
import {NamespaceName} from '../../../../types/namespace/namespace-name.js';
import {ComponentStateMetadataSchema} from '../../../../data/schema/model/remote/state/component-state-metadata-schema.js';
import {Templates} from '../../../../core/templates.js';
import {DeploymentPhase} from '../../../../data/schema/model/remote/deployment-phase.js';
import {getSoloVersion} from '../../../../../version.js';
import * as constants from '../../../../core/constants.js';
import {SoloError} from '../../../../core/errors/solo-error.js';
import {Flags as flags} from '../../../../commands/flags.js';
import {promptTheUserForDeployment} from '../../../../core/resolvers.js';
import {ConsensusNode} from '../../../../core/model/consensus-node.js';
import {RemoteConfigRuntimeStateApi} from '../../api/remote-config-runtime-state-api.js';
import {type RemoteConfigValidatorApi} from '../../../../core/config/remote/api/remote-config-validator-api.js';
import {ComponentFactoryApi} from '../../../../core/config/remote/api/component-factory-api.js';
import {ComponentTypes} from '../../../../core/config/remote/enumerations/component-types.js';
import {LocalConfigRuntimeState} from '../local/local-config-runtime-state.js';
import {RemoteConfigMetadataSchema} from '../../../../data/schema/model/remote/remote-config-metadata-schema.js';
import {ApplicationVersionsSchema} from '../../../../data/schema/model/common/application-versions-schema.js';
import {ClusterSchema} from '../../../../data/schema/model/common/cluster-schema.js';
import {DeploymentStateSchema} from '../../../../data/schema/model/remote/deployment-state-schema.js';
import {DeploymentHistorySchema} from '../../../../data/schema/model/remote/deployment-history-schema.js';
import {RemoteConfigSchemaDefinition} from '../../../../data/schema/migration/impl/remote/remote-config-schema-definition.js';
import {RemoteConfigSchema} from '../../../../data/schema/model/remote/remote-config-schema.js';
import {ConsensusNodeStateSchema} from '../../../../data/schema/model/remote/state/consensus-node-state-schema.js';
import {UserIdentitySchema} from '../../../../data/schema/model/common/user-identity-schema.js';
import {Deployment} from '../local/deployment.js';
import {RemoteConfig} from './remote-config.js';
import {ComponentIdsSchema} from '../../../../data/schema/model/remote/state/component-ids-schema.js';
import * as helpers from '../../../../core/helpers.js';

enum RuntimeStatePhase {
  Loaded = 'loaded',
  NotLoaded = 'not_loaded',
}

interface VersionField {
  value: SemVer;
}

@injectable()
export class RemoteConfigRuntimeState implements RemoteConfigRuntimeStateApi {
  private static readonly SOLO_REMOTE_CONFIGMAP_DATA_KEY: string = 'remote-config-data';

  private phase: RuntimeStatePhase = RuntimeStatePhase.NotLoaded;

  public clusterReferences: Map<Context, ClusterReferenceName> = new Map();
  private namespace: NamespaceName;

  private source?: RemoteConfigSource;
  private backend?: YamlConfigMapStorageBackend;

  private _remoteConfig?: RemoteConfig;

  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.LocalConfigRuntimeState) private readonly localConfig?: LocalConfigRuntimeState,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
    @inject(InjectTokens.RemoteConfigValidator) private readonly remoteConfigValidator?: RemoteConfigValidatorApi,
    @inject(InjectTokens.ObjectMapper) private readonly objectMapper?: ObjectMapper,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.remoteConfigValidator = patchInject(
      remoteConfigValidator,
      InjectTokens.RemoteConfigValidator,
      this.constructor.name,
    );
    this.objectMapper = patchInject(objectMapper, InjectTokens.ObjectMapper, this.constructor.name);
  }

  public get configuration(): RemoteConfig {
    this.failIfNotLoaded();
    return this._remoteConfig;
  }

  public get components(): Readonly<ComponentsDataWrapperApi> {
    this.failIfNotLoaded();
    return this._remoteConfig.components;
  }

  public get currentCluster(): ClusterReferenceName {
    return this.k8Factory.default().clusters().readCurrent();
  }

  public async load(namespace?: NamespaceName, context?: Context): Promise<void> {
    if (this.isLoaded()) {
      return;
    }

    await this.populateFromExisting(namespace, context);
  }

  private async populateFromConfigMap(configMap: ConfigMap, remoteConfig?: RemoteConfigSchema): Promise<void> {
    this.backend = new YamlConfigMapStorageBackend(configMap);

    this.source = new RemoteConfigSource(
      new RemoteConfigSchemaDefinition(this.objectMapper),
      this.objectMapper,
      this.backend,
    );

    await this.source.load();

    if (remoteConfig) {
      this.source.setModelData(remoteConfig);
    }

    this._remoteConfig = new RemoteConfig(this.source.modelData);
    this.phase = RuntimeStatePhase.Loaded;
  }

  private async updateConfigMap(
    context: Context,
    namespace: NamespaceName,
    data: Record<string, string>,
  ): Promise<void> {
    await this.k8Factory.getK8(context).configMaps().update(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME, data);
  }

  public isLoaded(): boolean {
    return this.phase === RuntimeStatePhase.Loaded;
  }

  private failIfNotLoaded(): void {
    if (!this.isLoaded()) {
      throw new ReadRemoteConfigBeforeLoadError('Attempting to read from remote config before loading it');
    }
  }

  public async persist(): Promise<void> {
    if (!this.isLoaded()) {
      throw new WriteRemoteConfigBeforeLoadError('Attempting to persist remote config before loading it');
    }

    await this.source.persist();
    const remoteConfigDataBytes: Buffer = await this.backend.readBytes(
      RemoteConfigRuntimeState.SOLO_REMOTE_CONFIGMAP_DATA_KEY,
    );

    const remoteConfigData: Record<string, string> = {
      [RemoteConfigRuntimeState.SOLO_REMOTE_CONFIGMAP_DATA_KEY]: remoteConfigDataBytes.toString('utf8'),
    };

    const promises: Promise<void>[] = [];

    for (const context of this.clusterReferences.keys()) {
      promises.push(this.updateConfigMap(context, this.namespace, remoteConfigData));
    }

    await Promise.all(promises);
  }

  public async create(
    argv: ArgvStruct,
    ledgerPhase: LedgerPhase,
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deploymentName: DeploymentName,
    clusterReference: ClusterReferenceName,
    context: Context,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): Promise<void> {
    this.populateClusterReferences(deploymentName);

    const consensusNodeStates: ConsensusNodeStateSchema[] = nodeAliases.map(
      (nodeAlias: NodeAlias): ConsensusNodeStateSchema => {
        return new ConsensusNodeStateSchema(
          new ComponentStateMetadataSchema(
            Templates.renderComponentIdFromNodeAlias(nodeAlias),
            namespace.name,
            clusterReference,
            DeploymentPhase.REQUESTED,
          ),
        );
      },
    );

    const userIdentity: Readonly<UserIdentitySchema> = this.localConfig.configuration.userIdentity;
    const cliVersion: SemVer = new SemVer(getSoloVersion());
    const command: string = argv._.join(' ');

    const cluster: ClusterSchema = new ClusterSchema(
      clusterReference,
      namespace.name,
      deploymentName,
      dnsBaseDomain,
      dnsConsensusNodePattern,
    );

    const remoteConfig: RemoteConfigSchema = new RemoteConfigSchema(
      3,
      new RemoteConfigMetadataSchema(new Date(), userIdentity),
      new ApplicationVersionsSchema(cliVersion),
      [cluster],
      new DeploymentStateSchema(ledgerPhase, new ComponentIdsSchema(nodeAliases.length + 1), consensusNodeStates),
      new DeploymentHistorySchema([command], command),
    );

    const configMap: ConfigMap = await this.createConfigMap(namespace, context);
    await this.populateFromConfigMap(configMap, remoteConfig);

    await this.persist();
  }

  public async createFromExisting(
    namespace: NamespaceName,
    clusterReference: ClusterReferenceName,
    deploymentName: DeploymentName,
    componentFactory: ComponentFactoryApi,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
    existingClusterContext: Context,
    argv: ArgvStruct,
    nodeAliases: NodeAliases,
  ): Promise<void> {
    await this.populateFromExisting(namespace, existingClusterContext);

    this.populateClusterReferences(deploymentName);

    const newClusterContext: Context = this.localConfig.configuration.clusterRefs
      .get(clusterReference.toString())
      ?.toString();

    //? Create copy of the existing remote config inside the new cluster
    await this.createConfigMap(namespace, newClusterContext);
    await this.persist();

    //* update the command history
    this.addCommandToHistory(argv._.join(' '));

    //* add the new clusters
    this.configuration.addCluster(
      new ClusterSchema(clusterReference, namespace.name, deploymentName, dnsBaseDomain, dnsConsensusNodePattern),
    );

    //* add the new nodes to components
    for (const nodeAlias of nodeAliases) {
      this.configuration.components.addNewComponent(
        componentFactory.createNewConsensusNodeComponent(
          Templates.renderComponentIdFromNodeAlias(nodeAlias),
          clusterReference,
          namespace,
          DeploymentPhase.REQUESTED,
        ),
        ComponentTypes.ConsensusNode,
      );
    }

    await this.persist();
  }

  public addCommandToHistory(command: string): void {
    this.source.modelData.history.commands.push(command);
    this.source.modelData.history.lastExecutedCommand = command;

    if (this.source.modelData.history.commands.length > constants.SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY) {
      this.source.modelData.history.commands.shift();
    }
  }

  public async createConfigMap(namespace: NamespaceName, context: Context): Promise<ConfigMap> {
    const name: string = constants.SOLO_REMOTE_CONFIGMAP_NAME;
    const labels: Record<string, string> = constants.SOLO_REMOTE_CONFIGMAP_LABELS;
    await this.k8Factory
      .getK8(context)
      .configMaps()
      .create(namespace, name, labels, {[RemoteConfigRuntimeState.SOLO_REMOTE_CONFIGMAP_DATA_KEY]: '{}'});
    return await this.k8Factory.getK8(context).configMaps().read(namespace, name);
  }

  private async getConfigMap(namespace?: NamespaceName, context?: Context): Promise<ConfigMap> {
    const configMap: ConfigMap = await this.k8Factory
      .getK8(context)
      .configMaps()
      .read(namespace, constants.SOLO_REMOTE_CONFIGMAP_NAME);

    if (!configMap) {
      throw new SoloError(`Remote config ConfigMap not found for namespace: ${namespace}, context: ${context}`);
    }

    return configMap;
  }

  public async populateFromExisting(namespace: NamespaceName, context: Context): Promise<void> {
    const remoteConfigConfigMap: ConfigMap = await this.getConfigMap(namespace, context);
    await this.populateFromConfigMap(remoteConfigConfigMap);
  }

  public async remoteConfigExists(namespace: NamespaceName, context: Context): Promise<boolean> {
    const configMap: ConfigMap = await this.getConfigMap(namespace, context);
    return !!configMap;
  }

  public populateClusterReferences(deploymentName: DeploymentName): Context {
    const deployment: Deployment = this.localConfig.configuration.deploymentByName(deploymentName);
    this.namespace = NamespaceName.of(deployment.namespace);

    for (const clusterReference of deployment.clusters) {
      const context: Context = this.localConfig.configuration.clusterRefs.get(clusterReference.toString())?.toString();
      this.clusterReferences.set(context, clusterReference.toString());
    }

    return this.localConfig.configuration.clusterRefs.get(deployment.clusters.get(0)?.toString())?.toString();
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

    const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
    const context: Context = this.populateClusterReferences(deploymentName);

    // TODO: Compare configs from clusterReferences
    await this.load(this.namespace, context);

    this.logger.info('Remote config loaded');
    if (!validate) {
      return;
    }

    await this.remoteConfigValidator.validateComponents(
      this.namespace,
      skipConsensusNodesValidation,
      this.configuration.state,
    );

    const currentCommand: string = argv._?.join(' ');
    const commandArguments: string = flags.stringifyArgv(argv);

    this.addCommandToHistory(
      `Executed by ${this.localConfig.configuration.userIdentity.name}: ${currentCommand} ${commandArguments}`.trim(),
    );

    this.initializeComponentVersions(argv, this.source.modelData);

    await this.persist();
  }

  private initializeComponentVersions(argv: AnyObject, remoteConfig: RemoteConfigSchema): void {
    remoteConfig.versions.chart = argv[flags.soloChartVersion.name]
      ? new SemVer(argv[flags.soloChartVersion.name])
      : new SemVer(flags.soloChartVersion.definition.defaultValue as string);

    // set default versions if not set
    const componentTypes: ComponentTypes[] = [
      ComponentTypes.BlockNode,
      ComponentTypes.RelayNodes,
      ComponentTypes.MirrorNode,
      ComponentTypes.Explorer,
      ComponentTypes.ConsensusNode,
    ];

    for (const componentType of componentTypes) {
      const version: SemVer = this.getComponentVersion(componentType);
      if (eq(version, new SemVer('0.0.0'))) {
        switch (componentType) {
          case ComponentTypes.BlockNode: {
            this.updateComponentVersion(
              componentType,
              new SemVer(flags.blockNodeChartVersion.definition.defaultValue as string),
            );
            break;
          }
          case ComponentTypes.RelayNodes: {
            this.updateComponentVersion(
              componentType,
              new SemVer(flags.relayReleaseTag.definition.defaultValue as string),
            );
            break;
          }
          case ComponentTypes.MirrorNode: {
            this.updateComponentVersion(
              componentType,
              new SemVer(flags.mirrorNodeVersion.definition.defaultValue as string),
            );
            break;
          }
          case ComponentTypes.Explorer: {
            this.updateComponentVersion(
              componentType,
              new SemVer(flags.explorerVersion.definition.defaultValue as string),
            );
            break;
          }
          case ComponentTypes.ConsensusNode: {
            this.updateComponentVersion(componentType, new SemVer(flags.releaseTag.definition.defaultValue as string));
            break;
          }
          default: {
            throw new SoloError(`Unsupported component type: ${componentType}`);
          }
        }
      }
    }
  }

  public async deleteComponents(): Promise<void> {
    this._remoteConfig.state.consensusNodes = [];
    this._remoteConfig.state.blockNodes = [];
    this._remoteConfig.state.envoyProxies = [];
    this._remoteConfig.state.haProxies = [];
    this._remoteConfig.state.explorers = [];
    this._remoteConfig.state.mirrorNodes = [];
    this._remoteConfig.state.relayNodes = [];
  }

  private async setDefaultNamespaceAndDeploymentIfNotSet(argv: AnyObject): Promise<void> {
    if (this.configManager.hasFlag(flags.namespace)) {
      return;
    }

    // TODO: Current quick fix for commands where namespace is not passed
    let deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);
    let currentDeployment: Deployment = this.localConfig.configuration.deploymentByName(deploymentName);

    if (!deploymentName) {
      deploymentName = await promptTheUserForDeployment(this.configManager);
      currentDeployment = this.localConfig.configuration.deploymentByName(deploymentName);
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

    for (const node of Object.values(this.configuration.state.consensusNodes)) {
      const cluster: ClusterSchema = this.configuration.clusters.find(
        (cluster: ClusterSchema): boolean => cluster.name === node.metadata.cluster,
      );
      const context: Context = this.localConfig.configuration.clusterRefs.get(node.metadata.cluster)?.toString();
      const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(node.metadata.id);
      const nodeId: NodeId = Templates.renderNodeIdFromComponentId(node.metadata.id);

      consensusNodes.push(
        new ConsensusNode(
          nodeAlias,
          nodeId,
          node.metadata.namespace,
          node.metadata.cluster,
          context,
          cluster.dnsBaseDomain,
          cluster.dnsConsensusNodePattern,
          Templates.renderConsensusNodeFullyQualifiedDomainName(
            nodeAlias,
            nodeId,
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

    const clusterReference: ClusterReferenceName =
      this.configManager.getFlag(flags.clusterRef) ??
      this.localConfig.configuration.deploymentByName(deploymentName).clusters[0] ??
      this.k8Factory.default().clusters().readCurrent();

    const context: Context = this.localConfig.configuration.clusterRefs.get(clusterReference)?.toString();

    this.logger.debug(`Using context ${context} for cluster ${clusterReference} for deployment ${deploymentName}`);

    return context;
  }

  public getNamespace(): NamespaceName {
    return NamespaceName.of(this.configuration.clusters?.at(0)?.namespace);
  }

  public extractContextFromConsensusNodes(nodeAlias: NodeAlias): Optional<string> {
    return helpers.extractContextFromConsensusNodes(nodeAlias, this.getConsensusNodes());
  }

  public updateComponentVersion(type: ComponentTypes, version: SemVer): void {
    const updateVersionCallback: (versionField: VersionField) => void = (versionField: VersionField): void => {
      versionField.value = version;
    };

    this.applyCallbackToVersionField(type, updateVersionCallback);
  }

  /**
   * Method used to map the component type to the specific version field
   * and pass it to a callback to apply modifications
   */
  private applyCallbackToVersionField(
    componentType: ComponentTypes,
    callback: (versionField: VersionField) => void,
  ): void {
    switch (componentType) {
      case ComponentTypes.ConsensusNode: {
        const versionField: VersionField = {value: this.configuration.versions.consensusNode};
        callback(versionField);
        this.configuration.versions.consensusNode = versionField.value;
        break;
      }
      case ComponentTypes.MirrorNode: {
        const versionField: VersionField = {value: this.configuration.versions.mirrorNodeChart};
        callback(versionField);
        this.configuration.versions.mirrorNodeChart = versionField.value;
        break;
      }
      case ComponentTypes.Explorer: {
        const versionField: VersionField = {value: this.configuration.versions.explorerChart};
        callback(versionField);
        this.configuration.versions.explorerChart = versionField.value;
        break;
      }
      case ComponentTypes.RelayNodes: {
        const versionField: VersionField = {value: this.configuration.versions.jsonRpcRelayChart};
        callback(versionField);
        this.configuration.versions.jsonRpcRelayChart = versionField.value;
        break;
      }
      case ComponentTypes.BlockNode: {
        const versionField: VersionField = {value: this.configuration.versions.blockNodeChart};
        callback(versionField);
        this.configuration.versions.blockNodeChart = versionField.value;
        break;
      }
      case ComponentTypes.Cli: {
        const versionField: VersionField = {value: this.configuration.versions.cli};
        callback(versionField);
        this.configuration.versions.cli = versionField.value;
        break;
      }
      case ComponentTypes.Chart: {
        const versionField: VersionField = {value: this.configuration.versions.chart};
        callback(versionField);
        this.configuration.versions.chart = versionField.value;
        break;
      }
      default: {
        throw new SoloError(`Unsupported component type: ${componentType}`);
      }
    }
  }

  public getComponentVersion(type: ComponentTypes): SemVer {
    let version: SemVer;

    const getVersionCallback: (versionField: VersionField) => void = (versionField: VersionField): void => {
      version = versionField.value;
    };

    this.applyCallbackToVersionField(type, getVersionCallback);
    return version;
  }
}
