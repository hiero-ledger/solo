// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors/solo-error.js';
import {Flags as flags} from '../../../commands/flags.js';
import {ComponentsDataWrapper} from './components-data-wrapper.js';
import {RemoteConfigValidator} from './remote-config-validator.js';
import {type K8Factory} from '../../../integration/kube/k8-factory.js';
import {
  type ClusterReference,
  type ClusterReferences,
  type Context,
  type DeploymentName, EmailAddress,
  type NamespaceNameAsString,
} from './types.js';
import {type SoloLogger} from '../../logging/solo-logger.js';
import {type ConfigManager} from '../../config-manager.js';
import {type LocalConfig} from '../local/local-config.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../../dependency-injection/container-helper.js';
import {type AnyObject, type ArgvStruct, type NodeAlias, type NodeAliases} from '../../../types/aliases.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {ConsensusNode} from '../../model/consensus-node.js';
import {Templates} from '../../templates.js';
import {promptTheUserForDeployment} from '../../resolvers.js';
import {getSoloVersion} from '../../../../version.js';
import {DeploymentStates} from './enumerations/deployment-states.js';
import {type RemoteConfigRuntimeState} from '../../../business/runtime-state/remote-config-runtime-state.js';
import {type RemoteConfig} from '../../../data/schema/model/remote/remote-config.js';
import {SemVer} from 'semver';
import {Cluster} from '../../../data/schema/model/common/cluster.js';
import {DeploymentStructure} from '../local/local-config-data.js';
import {DeploymentState} from '../../../data/schema/model/remote/deployment-state.js';
import {RemoteConfigMetadata} from '../../../data/schema/model/remote/remote-config-metadata.js';
import * as constants from '../../constants.js';

/**
 * Uses Kubernetes ConfigMaps to manage the remote configuration data by creating, loading, modifying,
 * and saving the configuration data to and from a Kubernetes cluster.
 */
@injectable()
export class RemoteConfigManager {
  /**
   * @param k8Factory - The Kubernetes client used for interacting with ConfigMaps.
   * @param logger - The logger for recording activity and errors.
   * @param localConfig - Local configuration for the remote config.
   * @param configManager - Manager to retrieve application flags and settings.
   * @param remoteConfigRuntimeState
   */
  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.LocalConfig) private readonly localConfig?: LocalConfig,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
    @inject(InjectTokens.RemoteConfigRuntimeState) private readonly remoteConfigRuntimeState?: RemoteConfigRuntimeState,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfig, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.remoteConfigRuntimeState = patchInject(
      remoteConfigRuntimeState,
      InjectTokens.RemoteConfigRuntimeState,
      this.constructor.name,
    );
  }

  /* ---------- Getters ---------- */

  public get currentCluster(): ClusterReference {
    return this.k8Factory.default().clusters().readCurrent();
  }

  /* ---------- Readers and Modifiers ---------- */

  /**
   * Creates a new remote configuration in the Kubernetes cluster.
   * Gathers data from the local configuration and constructs a new ConfigMap
   * entry in the cluster with initial command history and metadata.
   */
  public async create(
    argv: ArgvStruct,
    state: DeploymentStates,
    nodeAliases: NodeAliases,
    namespace: NamespaceName,
    deployment: DeploymentName,
    clusterReference: ClusterReference,
    context: Context,
    dnsBaseDomain: string,
    dnsConsensusNodePattern: string,
  ): Promise<void> {
    const clusters: Record<ClusterReference, Cluster> = {
      [clusterReference]: new Cluster(
        clusterReference,
        namespace.name,
        deployment,
        dnsBaseDomain,
        dnsConsensusNodePattern,
      ),
    };

    const lastUpdatedAt: Date = new Date();
    const email: EmailAddress = this.localConfig.userEmailAddress;
    const soloVersion: string = getSoloVersion();
    const currentCommand: string = argv._.join(' ');

    this.remoteConfig = new RemoteConfigDataWrapper({
      clusters,
      metadata: new RemoteConfigMetadata(namespace.name, deployment, state, lastUpdatedAt, email, soloVersion),
      commandHistory: [currentCommand],
      lastExecutedCommand: currentCommand,
      components: ComponentsDataWrapper.initializeWithNodes(nodeAliases, clusterReference, namespace.name),
    });

    await this.createConfigMap(context);
  }

  public addCommandToHistory(command: string, remoteConfig: RemoteConfig): void {
    remoteConfig.history.commands.push(command);
    remoteConfig.history.lastExecutedCommand = command;

    if (remoteConfig.history.commands.length > constants.SOLO_REMOTE_CONFIG_MAX_COMMAND_IN_HISTORY) {
      remoteConfig.history.commands.shift();
    }
  }

  /* ---------- Listr Task Builders ---------- */

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

    await this.load(); // TODO LOAD RUNTIME STATE

    this.logger.info('Remote config loaded');
    if (!validate) {
      return;
    }

    await RemoteConfigValidator.validateComponents(
      this.configManager.getFlag(flags.namespace),
      this.remoteConfigRuntimeState.state,
      this.k8Factory,
      this.localConfig,
      skipConsensusNodesValidation,
    );

    await this.remoteConfigRuntimeState.modify(async (remoteConfig: RemoteConfig) => {
      const currentCommand: string = argv._?.join(' ');
      const commandArguments: string = flags.stringifyArgv(argv);

      this.addCommandToHistory(
        `Executed by ${this.localConfig.userEmailAddress}: ${currentCommand} ${commandArguments}`.trim(),
        remoteConfig,
      );

      this.populateVersionsInMetadata(argv, remoteConfig);

      await this.remoteConfigRuntimeState.handleArgv(argv);
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

  /* ---------- Utilities ---------- */

  /** Empties the component data inside the remote config */
  public async deleteComponents(): Promise<void> {
    await this.remoteConfigRuntimeState.modify(async (remoteConfig: RemoteConfig) => {
      remoteConfig.state = new DeploymentState();
    });
  }

  private async setDefaultNamespaceAndDeploymentIfNotSet(argv: AnyObject): Promise<void> {
    if (this.configManager.hasFlag(flags.namespace)) {
      return;
    }

    // TODO: Current quick fix for commands where namespace is not passed
    let deploymentName: DeploymentName = this.configManager.getFlag<DeploymentName>(flags.deployment);
    let currentDeployment: DeploymentStructure = this.localConfig.deployments[deploymentName];

    if (!deploymentName) {
      deploymentName = await promptTheUserForDeployment(this.configManager);
      currentDeployment = this.localConfig.deployments[deploymentName];
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
   * Get the consensus nodes from the remoteConfigManager and use the localConfig to get the context
   * @returns an array of ConsensusNode objects
   */
  public getConsensusNodes(): ConsensusNode[] {
    if (!this.remoteConfigRuntimeState.isLoaded()) {
      throw new SoloError('Remote configuration is not loaded, and was expected to be loaded');
    }

    const consensusNodes: ConsensusNode[] = [];

    for (const node of Object.values(this.remoteConfigRuntimeState.state.consensusNodes)) {
      const cluster: Cluster = this.remoteConfigRuntimeState.clusters.find(
        (cluster: Cluster): boolean => cluster.name === node.metadata.cluster,
      );
      const context: Context = this.localConfig.clusterRefs[node.metadata.cluster];
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
    const accumulator: ClusterReferences = {};

    for (const node of nodes) {
      accumulator[node.cluster] ||= node.context;
    }

    return accumulator;
  }

  private getContextForFirstCluster(): string {
    const deploymentName: DeploymentName = this.configManager.getFlag(flags.deployment);

    const clusterReference: ClusterReference = this.localConfig.deployments[deploymentName].clusters[0];

    const context: Context = this.localConfig.clusterRefs[clusterReference];

    this.logger.debug(`Using context ${context} for cluster ${clusterReference} for deployment ${deploymentName}`);

    return context;
  }
}
