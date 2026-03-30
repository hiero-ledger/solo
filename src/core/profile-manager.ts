// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'node:path';
import {SoloError} from './errors/solo-error.js';
import {IllegalArgumentError} from './errors/illegal-argument-error.js';
import {MissingArgumentError} from './errors/missing-argument-error.js';
import * as yaml from 'yaml';
import dot from 'dot-object';
import {readFile, writeFile} from 'node:fs/promises';

import {Flags as flags} from '../commands/flags.js';
import {Templates} from './templates.js';
import * as constants from './constants.js';
import {type ConfigManager} from './config-manager.js';
import * as helpers from './helpers.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type AnyObject, type DirectoryPath, type NodeAlias, type NodeAliases, type Path} from '../types/aliases.js';
import {type Optional} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type ClusterReferenceName, DeploymentName, Realm, Shard} from './../types/index.js';
import {PathEx} from '../business/utils/path-ex.js';
import {AccountManager} from './account-manager.js';
import {LocalConfigRuntimeState} from '../business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../business/runtime-state/api/remote-config-runtime-state-api.js';
import {BlockNodeStateSchema} from '../data/schema/model/remote/state/block-node-state-schema.js';
import {BlockNodesJsonWrapper} from './block-nodes-json-wrapper.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {Address} from '../business/address/address.js';
import * as versions from '../../version.js';
import {Numbers} from '../business/utils/numbers.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';

@injectable()
export class ProfileManager {
  private readonly logger: SoloLogger;
  private readonly configManager: ConfigManager;
  private readonly cacheDir: DirectoryPath;
  private readonly k8Factory: K8Factory;
  private readonly remoteConfig: RemoteConfigRuntimeStateApi;
  private readonly accountManager: AccountManager;
  private readonly localConfig: LocalConfigRuntimeState;

  public constructor(
    @inject(InjectTokens.SoloLogger) logger?: SoloLogger,
    @inject(InjectTokens.ConfigManager) configManager?: ConfigManager,
    @inject(InjectTokens.CacheDir) cacheDirectory?: DirectoryPath,
    @inject(InjectTokens.K8Factory) k8Factory?: K8Factory,
    @inject(InjectTokens.RemoteConfigRuntimeState) remoteConfig?: RemoteConfigRuntimeStateApi,
    @inject(InjectTokens.AccountManager) accountManager?: AccountManager,
    @inject(InjectTokens.LocalConfigRuntimeState) localConfig?: LocalConfigRuntimeState,
  ) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.cacheDir = PathEx.resolve(patchInject(cacheDirectory, InjectTokens.CacheDir, this.constructor.name));
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.remoteConfig = patchInject(remoteConfig, InjectTokens.RemoteConfigRuntimeState, this.constructor.name);
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
    this.localConfig = patchInject(localConfig, InjectTokens.LocalConfigRuntimeState, this.constructor.name);
  }

  /**
   * Set value in the YAML object
   * @param itemPath - item path in the yaml
   * @param value - value to be set
   * @param yamlRoot - root of the YAML object
   * @returns
   */
  public _setValue(itemPath: string, value: unknown, yamlRoot: AnyObject): AnyObject {
    // find the location where to set the value in the YAML
    const itemPathParts: string[] = itemPath.split('.');
    let parent: AnyObject = yamlRoot;
    let current: AnyObject = parent;
    let previousItemPath: string | number = '';
    for (const itemPathPart of itemPathParts) {
      if (Numbers.isNumeric(itemPathPart)) {
        const itemPathIndex: number = Number.parseInt(itemPathPart, 10); // numeric path part can only be array index
        if (!Array.isArray(parent[previousItemPath])) {
          parent[previousItemPath] = [];
        }

        const parentArray: AnyObject[] = parent[previousItemPath] as AnyObject[];
        if (!parentArray[itemPathIndex]) {
          parentArray[itemPathIndex] = {};
        }

        parent = parentArray as unknown as AnyObject;
        previousItemPath = itemPathIndex;
        current = parent[itemPathIndex] as AnyObject;
      } else {
        if (!current[itemPathPart]) {
          current[itemPathPart] = {};
        }

        parent = current;
        previousItemPath = itemPathPart;
        current = parent[itemPathPart];
      }
    }

    parent[previousItemPath] = value;
    return yamlRoot;
  }

  /**
   * Set items for the chart
   * @param itemPath - item path in the YAML, if empty then root of the YAML object will be used
   * @param items - the element object
   * @param yamlRoot - root of the YAML object to update
   */
  public _setChartItems(itemPath: string, items: AnyObject | undefined, yamlRoot: AnyObject): void {
    if (!items) {
      return;
    }

    const dotItems: AnyObject = dot.dot(items) as AnyObject;

    for (const key in dotItems) {
      let itemKey: string = key;

      // if it is an array key like extraEnv[0].JAVA_OPTS, convert it into a dot separated key as extraEnv.0.JAVA_OPTS
      if (key.includes('[')) {
        itemKey = key.replace('[', '.').replace(']', '');
      }

      if (itemPath) {
        this._setValue(`${itemPath}.${itemKey}`, dotItems[key], yamlRoot);
      } else {
        this._setValue(itemKey, dotItems[key], yamlRoot);
      }
    }
  }

  public async prepareStagingDirectory(
    consensusNodes: ConsensusNode[],
    nodeAliases: NodeAliases,
    yamlRoot: AnyObject,
    domainNamesMapping: Record<NodeAlias, string>,
    deploymentName: DeploymentName,
    applicationPropertiesPath: string,
  ): Promise<void> {
    const accountMap: Map<NodeAlias, string> = this.accountManager.getNodeAccountMap(
      consensusNodes.map((node): NodeAlias => node.name),
      deploymentName,
    );

    // set consensus pod level resources
    for (const [nodeIndex, nodeAlias] of nodeAliases.entries()) {
      this._setValue(`hedera.nodes.${nodeIndex}.name`, nodeAlias, yamlRoot);
      this._setValue(`hedera.nodes.${nodeIndex}.nodeId`, `${Templates.nodeIdFromNodeAlias(nodeAlias)}`, yamlRoot);
      this._setValue(`hedera.nodes.${nodeIndex}.accountId`, accountMap.get(nodeAlias), yamlRoot);
    }

    const stagingDirectory: string = Templates.renderStagingDir(
      this.configManager.getFlag(flags.cacheDir),
      this.configManager.getFlag(flags.releaseTag),
    );

    if (!fs.existsSync(stagingDirectory)) {
      fs.mkdirSync(stagingDirectory, {recursive: true});
    }

    const releaseTag: string = this.configManager.getFlag(flags.releaseTag);
    const needsConfigTxt: boolean = versions.needsConfigTxtForConsensusVersion(releaseTag);
    let configTxtPath: Optional<string>;
    if (needsConfigTxt) {
      configTxtPath = await this.prepareConfigTxt(
        accountMap,
        consensusNodes,
        stagingDirectory,
        releaseTag,
        domainNamesMapping,
        this.configManager.getFlag(flags.app),
        this.configManager.getFlag(flags.chainId),
      );
    }

    // Update application.properties with shard and realm
    await this.updateApplicationPropertiesWithRealmAndShard(
      applicationPropertiesPath,
      this.localConfig.configuration.realmForDeployment(deploymentName),
      this.localConfig.configuration.shardForDeployment(deploymentName),
    );

    await this.updateApplicationPropertiesForBlockNode(applicationPropertiesPath);

    for (const flag of flags.nodeConfigFileFlags.values()) {
      const sourceFilePath: string = this.configManager.getFlagFile(flag);
      const currentWorkingDirectory: string = process.env.INIT_CWD || process.cwd();
      const sourceAbsoluteFilePath: string = PathEx.resolve(currentWorkingDirectory, sourceFilePath);
      if (!fs.existsSync(sourceAbsoluteFilePath)) {
        throw new SoloError(
          `Configuration file does not exist for: ${flag.name}, absolute path: ${sourceAbsoluteFilePath}, path: ${sourceFilePath}`,
        );
      }

      const destinationFileName: string = path.basename(flag.definition.defaultValue as string);
      const destinationPath: string = PathEx.join(stagingDirectory, 'templates', destinationFileName);
      this.logger.debug(`Copying configuration file to staging: ${sourceAbsoluteFilePath} -> ${destinationPath}`);

      fs.cpSync(sourceAbsoluteFilePath, destinationPath, {force: true});
    }

    if (configTxtPath) {
      this._setFileContentsAsValue('hedera.configMaps.configTxt', configTxtPath, yamlRoot);
    }
    this._setFileContentsAsValue(
      'hedera.configMaps.log4j2Xml',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'log4j2.xml'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.settingsTxt',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'settings.txt'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.applicationProperties',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'application.properties'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.apiPermissionsProperties',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'api-permission.properties'),
      yamlRoot,
    );
    this._setFileContentsAsValue(
      'hedera.configMaps.bootstrapProperties',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'bootstrap.properties'),
      yamlRoot,
    );

    this._setFileContentsAsValue(
      'hedera.configMaps.applicationEnv',
      PathEx.joinWithRealPath(stagingDirectory, 'templates', 'application.env'),
      yamlRoot,
    );

    try {
      if (
        this.remoteConfig.configuration.state.blockNodes.length === 0 &&
        this.remoteConfig.configuration.state.externalBlockNodes.length === 0
      ) {
        return;
      }
    } catch {
      // quick fix for tests where field on remote config are unaccessible
      return;
    }

    for (const node of consensusNodes) {
      const blockNodesJsonData: string = new BlockNodesJsonWrapper(
        node.blockNodeMap,
        node.externalBlockNodeMap,
      ).toJSON();

      let nodeIndex: number = 0;

      for (const [index, nodeAlias] of nodeAliases.entries()) {
        if (nodeAlias === node.name) {
          nodeIndex = index;
        }
      }

      // Create a unique filename for each consensus node
      const blockNodesJsonFilename: string = `${constants.BLOCK_NODES_JSON_FILE.replace('.json', '')}-${node.name}.json`;
      const blockNodesJsonPath: string = PathEx.join(constants.SOLO_CACHE_DIR, blockNodesJsonFilename);

      fs.writeFileSync(blockNodesJsonPath, JSON.stringify(JSON.parse(blockNodesJsonData), undefined, 2));
      this._setFileContentsAsValue(`hedera.nodes.${nodeIndex}.blockNodesJson`, blockNodesJsonPath, yamlRoot);
    }
  }

  public resourcesForNetworkUpgrade(
    itemPath: string,
    fileName: string,
    stagingDirectory: string,
    yamlRoot: AnyObject,
  ): void {
    const filePath: string = PathEx.join(stagingDirectory, 'templates', fileName);

    if (!fs.existsSync(filePath)) {
      return;
    }

    this._setFileContentsAsValue(itemPath, filePath, yamlRoot);
  }

  /**
   * Prepare a values file for Solo Helm chart
   * @param consensusNodes - the list of consensus nodes
   * @param domainNamesMapping
   * @param deploymentName
   * @param applicationPropertiesPath
   * @param jfrFile - the name of the custom JFR settings file to use for recording (basename only)
   * @returns mapping of cluster-ref to the full path to the values file
   */
  public async prepareValuesForSoloChart(
    consensusNodes: ConsensusNode[],
    domainNamesMapping: Record<NodeAlias, string>,
    deploymentName: DeploymentName,
    applicationPropertiesPath: string,
    jfrFile: string = '',
  ): Promise<Record<ClusterReferenceName, string>> {
    const filesMapping: Record<ClusterReferenceName, string> = {};

    for (const [clusterReference] of this.remoteConfig.getClusterRefs()) {
      const nodeAliases: NodeAliases = consensusNodes
        .filter((node): boolean => node.cluster === clusterReference)
        .map((node): NodeAlias => node.name);

      // generate the YAML
      const yamlRoot: AnyObject = {};

      await this.prepareStagingDirectory(
        consensusNodes,
        nodeAliases,
        yamlRoot,
        domainNamesMapping,
        deploymentName,
        applicationPropertiesPath,
      );

      // If a JFR settings file is provided, read the defaults from solo-values.yaml,
      // find the JAVA_OPTS entry in defaults.root.extraEnv, and append the
      // -XX:StartFlightRecording flags so that the recorder starts automatically
      // when the consensus node JVM launches.
      if (jfrFile !== '') {
        const soloValuesYaml: AnyObject = yaml.parse(
          fs.readFileSync(constants.SOLO_DEPLOYMENT_VALUES_FILE, 'utf8'),
        ) as AnyObject;
        const extraEnvironment: AnyObject[] = (soloValuesYaml?.defaults?.root?.extraEnv as AnyObject[]) ?? [];
        const javaOption: AnyObject | undefined = extraEnvironment.find(
          (environmentObject: AnyObject): boolean => environmentObject.name === 'JAVA_OPTS',
        );
        if (javaOption) {
          javaOption.value +=
            ' -XX:StartFlightRecording=dumponexit=true' +
            `,settings=${constants.HEDERA_HAPI_PATH}/data/config/${jfrFile}` +
            `,filename=${constants.HEDERA_HAPI_PATH}/output/recording.jfr`;
        } else {
          this.logger.warn(
            `JAVA_OPTS not found in ${constants.SOLO_DEPLOYMENT_VALUES_FILE}; JFR settings file '${jfrFile}' will not be applied`,
          );
        }
        this._setChartItems('defaults.root', soloValuesYaml.defaults.root, yamlRoot);
      }

      const cachedValuesFile: string = PathEx.join(this.cacheDir, `solo-${clusterReference}.yaml`);
      filesMapping[clusterReference] = await this.writeToYaml(cachedValuesFile, yamlRoot);
    }

    return filesMapping;
  }

  private async bumpHederaConfigVersion(applicationPropertiesPath: string): Promise<void> {
    const fileContents: string = await readFile(applicationPropertiesPath, 'utf8');
    const lines: string[] = fileContents.split('\n');

    for (const line of lines) {
      if (line.startsWith('hedera.config.version=')) {
        const version: number = Number.parseInt(line.split('=')[1], 10) + 1;
        lines[lines.indexOf(line)] = `hedera.config.version=${version}`;
        break;
      }
    }

    await writeFile(applicationPropertiesPath, lines.join('\n'));
  }

  private async updateApplicationPropertiesForBlockNode(applicationPropertiesPath: string): Promise<void> {
    const blockNodes: BlockNodeStateSchema[] = this.remoteConfig.configuration.components.state.blockNodes;
    const hasDeployedBlockNodes: boolean = blockNodes.length > 0;
    if (!hasDeployedBlockNodes) {
      return;
    }

    const lines: string[] = await readFile(applicationPropertiesPath, 'utf8').then((fileText): string[] =>
      fileText.split('\n'),
    );

    const streamMode: string = constants.BLOCK_STREAM_STREAM_MODE;
    const writerMode: string = constants.BLOCK_STREAM_WRITER_MODE;

    let streamModeUpdated: boolean = false;
    let writerModeUpdated: boolean = false;
    for (const line of lines) {
      if (line.startsWith('blockStream.streamMode=')) {
        lines[lines.indexOf(line)] = `blockStream.streamMode=${streamMode}`;
        streamModeUpdated = true;
        continue;
      }
      if (line.startsWith('blockStream.writerMode=')) {
        lines[lines.indexOf(line)] = `blockStream.writerMode=${writerMode}`;
        writerModeUpdated = true;
      }
    }

    if (!streamModeUpdated) {
      lines.push(`blockStream.streamMode=${streamMode}`);
    }
    if (!writerModeUpdated) {
      lines.push(`blockStream.writerMode=${writerMode}`);
    }

    await writeFile(applicationPropertiesPath, lines.join('\n') + '\n');
  }

  private async updateApplicationPropertiesWithRealmAndShard(
    applicationPropertiesPath: string,
    realm: Realm,
    shard: Shard,
  ): Promise<void> {
    const fileContents: string = await readFile(applicationPropertiesPath, 'utf8');
    const lines: string[] = fileContents.split('\n');

    let realmUpdated: boolean = false;
    let shardUpdated: boolean = false;
    for (const line of lines) {
      if (line.startsWith('hedera.realm=')) {
        lines[lines.indexOf(line)] = `hedera.realm=${realm}`;
        realmUpdated = true;
        continue;
      }
      if (line.startsWith('hedera.shard=')) {
        lines[lines.indexOf(line)] = `hedera.shard=${shard}`;
        shardUpdated = true;
      }
    }

    if (!realmUpdated) {
      lines.push(`hedera.realm=${realm}`);
    }
    if (!shardUpdated) {
      lines.push(`hedera.shard=${shard}`);
    }

    let releaseTag: SemanticVersion<string> = new SemanticVersion<string>(versions.HEDERA_PLATFORM_VERSION);
    try {
      releaseTag = this.remoteConfig.configuration.versions.consensusNode;
    } catch {
      // Guard
    }

    let tssEnabled: boolean = false;
    try {
      tssEnabled = this.remoteConfig.configuration.state.tssEnabled;
    } catch {
      // Guard
    }

    if (!releaseTag.lessThan(versions.MINIMUM_HIERO_PLATFORM_VERSION_FOR_TSS) && tssEnabled) {
      lines.push('tss.hintsEnabled=true', 'tss.historyEnabled=true');

      if (this.remoteConfig.configuration.state.wrapsEnabled) {
        lines.push('tss.wrapsEnabled=true');
      }
    }

    await writeFile(applicationPropertiesPath, lines.join('\n') + '\n');
  }

  public async prepareValuesForNodeTransaction(
    applicationPropertiesPath: string,
    configTxtPath?: string,
  ): Promise<string> {
    const yamlRoot: AnyObject = {};
    if (configTxtPath) {
      this._setFileContentsAsValue('hedera.configMaps.configTxt', configTxtPath, yamlRoot);
    }
    await this.bumpHederaConfigVersion(applicationPropertiesPath);
    this._setFileContentsAsValue('hedera.configMaps.applicationProperties', applicationPropertiesPath, yamlRoot);

    const cachedValuesFile: string = PathEx.join(this.cacheDir, 'solo-node-transaction.yaml');
    return this.writeToYaml(cachedValuesFile, yamlRoot);
  }

  /**
   * Writes the YAML to file.
   *
   * @param cachedValuesFile - the target file to write the YAML root to.
   * @param yamlRoot - object to turn into YAML and write to file.
   */
  public async writeToYaml(cachedValuesFile: Path, yamlRoot: AnyObject): Promise<string> {
    return await new Promise<string>((resolve, reject): void => {
      fs.writeFile(cachedValuesFile, yaml.stringify(yamlRoot), (error): void => {
        if (error) {
          reject(error);
        }

        resolve(cachedValuesFile);
      });
    });
  }

  /**
   * Writes the contents of a file as a value for the given nested item path in the YAML object
   * @param itemPath - nested item path in the YAML object to store the file contents
   * @param valueFilePath - path to the file whose contents will be stored in the YAML object
   * @param yamlRoot - root of the YAML object
   */
  private _setFileContentsAsValue(itemPath: string, valueFilePath: string, yamlRoot: AnyObject): void {
    const fileContents: string = fs.readFileSync(valueFilePath, 'utf8');
    this._setValue(itemPath, fileContents, yamlRoot);
  }

  /**
   * Prepares config.txt file for the node
   * @param nodeAccountMap - the map of node aliases to account IDs
   * @param consensusNodes - the list of consensus nodes
   * @param destPath - path to the destination directory to write the config.txt file
   * @param releaseTagOverride - release tag override
   * @param domainNamesMapping
   * @param [appName] - the app name (default: HederaNode.jar)
   * @param [chainId] - chain ID (298 for local network)
   * @param [loadBalancerEnabled] - whether the load balancer is enabled (flag is not set by default)
   * @returns the config.txt file path
   */
  public async prepareConfigTxt(
    nodeAccountMap: Map<NodeAlias, string>,
    consensusNodes: ConsensusNode[],
    destinationPath: string,
    releaseTagOverride: string,
    domainNamesMapping: Record<NodeAlias, string>,
    appName: string = constants.HEDERA_APP_NAME,
    chainId: string = constants.HEDERA_CHAIN_ID,
  ): Promise<string> {
    let releaseTag: string = releaseTagOverride;
    if (!nodeAccountMap || nodeAccountMap.size === 0) {
      throw new MissingArgumentError('nodeAccountMap the map of node IDs to account IDs is required');
    }

    if (!releaseTag) {
      releaseTag = versions.HEDERA_PLATFORM_VERSION;
    }

    if (!fs.existsSync(destinationPath)) {
      throw new IllegalArgumentError(`config destPath does not exist: ${destinationPath}`, destinationPath);
    }

    const configFilePath: string = PathEx.join(destinationPath, 'config.txt');
    if (fs.existsSync(configFilePath)) {
      fs.unlinkSync(configFilePath);
    }

    // init variables
    const internalPort: number = +constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT;
    const externalPort: number = +constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT;
    const nodeStakeAmount: number = constants.HEDERA_NODE_DEFAULT_STAKE_AMOUNT;

    const releaseVersion: SemanticVersion<string> = new SemanticVersion(releaseTag);

    try {
      const configLines: string[] = [`swirld, ${chainId}`, `app, ${appName}`];

      let nodeSeq: number = 0;
      for (const consensusNode of consensusNodes) {
        const internalIP: string = helpers.getInternalAddress(
          releaseVersion,
          NamespaceName.of(consensusNode.namespace),
          consensusNode.name as NodeAlias,
        );

        const address: Address = await Address.getExternalAddress(
          consensusNode,
          this.k8Factory.getK8(consensusNode.context),
          externalPort,
        );

        const account: string | undefined = nodeAccountMap.get(consensusNode.name as NodeAlias);

        configLines.push(
          `address, ${nodeSeq}, ${nodeSeq}, ${consensusNode.name}, ${nodeStakeAmount}, ${internalIP}, ${internalPort}, ${address.hostString()}, ${address.port}, ${account}`,
        );

        nodeSeq += 1;
      }

      // TODO: remove once we no longer need less than v0.56
      if (releaseVersion.minor >= 41 && releaseVersion.minor < 56) {
        configLines.push(`nextNodeId, ${nodeSeq}`);
      }

      fs.writeFileSync(configFilePath, configLines.join('\n'));
      return configFilePath;
    } catch (error: Error | unknown) {
      throw new SoloError(
        `failed to generate config.txt, ${error instanceof Error ? (error as Error).message : 'unknown error'}`,
        error,
      );
    }
  }
}
