// SPDX-License-Identifier: Apache-2.0

import fs, {type Stats} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {format} from 'node:util';
import {SoloError} from './errors/solo-error.js';
import {Templates} from './templates.js';
import * as constants from './constants.js';
import {PrivateKey, ServiceEndpoint, type Long} from '@hiero-ledger/sdk';
import {
  type AnyObject,
  type AnyYargs,
  type AnyListrContext,
  type NodeAlias,
  type NodeAliases,
  type NodeId,
} from '../types/aliases.js';
import {type CommandFlag} from '../types/flag-types.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type Duration} from './time/duration.js';
import {type NodeAddConfigClass} from '../commands/node/config-interfaces/node-add-config-class.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {
  type ClusterReferenceName,
  type ClusterReferences,
  type Optional,
  type ReleaseNameData,
} from '../types/index.js';
import {NamespaceName} from '../types/namespace/namespace-name.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import chalk from 'chalk';
import {PathEx} from '../business/utils/path-ex.js';
import {type ConfigManager} from './config-manager.js';
import {Flags, Flags as flags} from '../commands/flags.js';
import {type Realm, type Shard} from './../types/index.js';
import {execSync} from 'node:child_process';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import yaml from 'yaml';
import {type ConfigMap} from '../integration/kube/resources/config-map/config-map.js';
import {type K8} from '../integration/kube/k8.js';
import {BlockNodesJsonWrapper} from './block-nodes-json-wrapper.js';
import {K8Helper} from '../business/utils/k8-helper.js';
import {type Container} from '../integration/kube/resources/container/container.js';
import {SemanticVersion} from '../business/utils/semantic-version.js';

export function getInternalAddress(
  releaseVersion: SemanticVersion<string> | string,
  namespaceName: NamespaceName,
  nodeAlias: NodeAlias,
): string {
  return new SemanticVersion(releaseVersion).greaterThanOrEqual('0.58.5')
    ? '127.0.0.1'
    : Templates.renderFullyQualifiedNetworkPodName(namespaceName, nodeAlias);
}

export function sleep(duration: Duration): Promise<void> {
  return new Promise<void>((resolve: (value: PromiseLike<void> | void) => void): void => {
    setTimeout(resolve, duration.toMillis());
  });
}

export function parseNodeAliases(
  input: string,
  consensusNodes?: ConsensusNode[],
  configManager?: ConfigManager,
): NodeAliases {
  let nodeAliases: NodeAlias[] = splitFlagInput(input, ',') as NodeAliases;
  if (nodeAliases.length === 0) {
    nodeAliases = consensusNodes?.map((node: {name: string}): NodeAlias => {
      return node.name as NodeAlias;
    });
    configManager?.setFlag(flags.nodeAliasesUnparsed, nodeAliases.join(','));

    if (!nodeAliases || nodeAliases.length === 0) {
      return [];
    }
  }
  return nodeAliases;
}

export function splitFlagInput(input: string, separator: string = ','): string[] {
  if (!input) {
    return [];
  } else if (typeof input !== 'string') {
    throw new SoloError(`input [input='${input}'] is not a comma separated string`);
  }

  return input
    .split(separator)
    .map((s): string => s.trim())
    .filter(Boolean);
}

/**
 * @param arr - The array to be cloned
 * @returns a new array with the same elements as the input array
 */
export function cloneArray<T>(array: T[]): T[] {
  return structuredClone(array);
}

export function getTemporaryDirectory(): string {
  return fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-'));
}

export function createBackupDirectory(
  destinationDirectory: string,
  prefix: string = 'backup',
  currentDate: Date = new Date(),
): string {
  const dateDirectory: string = format(
    '%s%s%s_%s%s%s',
    currentDate.getFullYear(),
    currentDate.getMonth().toString().padStart(2, '0'),
    currentDate.getDate().toString().padStart(2, '0'),
    currentDate.getHours().toString().padStart(2, '0'),
    currentDate.getMinutes().toString().padStart(2, '0'),
    currentDate.getSeconds().toString().padStart(2, '0'),
  );

  const backupDirectory: string = PathEx.join(destinationDirectory, prefix, dateDirectory);
  if (!fs.existsSync(backupDirectory)) {
    fs.mkdirSync(backupDirectory, {recursive: true});
  }

  return backupDirectory;
}

export function makeBackup(fileMap: Map<string, string> = new Map<string, string>(), removeOld: boolean = true): void {
  for (const entry of fileMap) {
    const sourcePath: string = entry[0];
    const destinationPath: string = entry[1];
    if (fs.existsSync(sourcePath)) {
      fs.cpSync(sourcePath, destinationPath);
      if (removeOld) {
        fs.rmSync(sourcePath);
      }
    }
  }
}

export function backupOldTlsKeys(
  nodeAliases: NodeAliases,
  keysDirectory: string,
  currentDate: Date = new Date(),
  directoryPrefix: string = 'tls',
): string {
  const backupDirectory: string = createBackupDirectory(keysDirectory, `unused-${directoryPrefix}`, currentDate);

  const fileMap: Map<string, string> = new Map<string, string>();
  for (const nodeAlias of nodeAliases) {
    const sourcePath: string = PathEx.join(keysDirectory, Templates.renderTLSPemPrivateKeyFile(nodeAlias));
    const destinationPath: string = PathEx.join(backupDirectory, Templates.renderTLSPemPrivateKeyFile(nodeAlias));
    fileMap.set(sourcePath, destinationPath);
  }

  makeBackup(fileMap, true);

  return backupDirectory;
}

export function backupOldPemKeys(
  nodeAliases: NodeAliases,
  keysDirectory: string,
  currentDate: Date = new Date(),
  directoryPrefix: string = 'gossip-pem',
): string {
  const backupDirectory: string = createBackupDirectory(keysDirectory, `unused-${directoryPrefix}`, currentDate);

  const fileMap: Map<string, string> = new Map<string, string>();
  for (const nodeAlias of nodeAliases) {
    const sourcePath: string = PathEx.join(keysDirectory, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
    const destinationPath: string = PathEx.join(backupDirectory, Templates.renderGossipPemPrivateKeyFile(nodeAlias));
    fileMap.set(sourcePath, destinationPath);
  }

  makeBackup(fileMap, true);

  return backupDirectory;
}

export function getEnvironmentValue(environmentVariableArray: string[], name: string): string {
  const kvPair: string = environmentVariableArray.find((v): boolean => v.startsWith(`${name}=`));
  return kvPair ? kvPair.split('=')[1] : undefined;
}

export function parseIpAddressToUint8Array(ipAddress: string): Uint8Array<ArrayBuffer> {
  const parts: string[] = ipAddress.split('.');
  const uint8Array: Uint8Array<ArrayBuffer> = new Uint8Array(4);

  for (let index: number = 0; index < 4; index++) {
    uint8Array[index] = Number.parseInt(parts[index], 10);
  }

  return uint8Array;
}

/** If the basename of the src did not match expected basename, rename it first, then copy to destination */
export function renameAndCopyFile(
  sourceFilePath: string,
  expectedBaseName: string,
  destinationDirectory: string,
): void {
  const sourceDirectory: string = path.dirname(sourceFilePath);
  if (path.basename(sourceFilePath) !== expectedBaseName) {
    fs.renameSync(sourceFilePath, PathEx.join(sourceDirectory, expectedBaseName));
  }
  // copy public key and private key to key directory
  fs.copyFile(
    PathEx.joinWithRealPath(sourceDirectory, expectedBaseName),
    PathEx.join(destinationDirectory, expectedBaseName),
    (error): void => {
      if (error) {
        throw new SoloError(`Error copying file: ${error.message}`);
      }
    },
  );
}

/**
 * Append root.image registry/repository/tag settings for a given node path to a Helm values argument string.
 * @param valuesArgument - existing values argument string (may be empty)
 * @param nodePath - base node path, e.g. `hedera.nodes[0]`
 * @param registry - image registry
 * @param repository - image repository
 * @param tag - image tag
 * @returns updated values argument string
 */
export function addRootImageValues(
  valuesArgument: string | undefined,
  nodePath: string,
  registry: string,
  repository: string,
  tag: string,
): string {
  let updatedValuesArgument: string = valuesArgument ?? '';
  updatedValuesArgument += ` --set "${nodePath}.root.image.registry=${registry}"`;
  updatedValuesArgument += ` --set "${nodePath}.root.image.tag=${tag}"`;
  updatedValuesArgument += ` --set "${nodePath}.root.image.repository=${repository}"`;
  return updatedValuesArgument;
}

/**
 * Returns an object that can be written to a file without data loss.
 * Contains fields needed for adding a new node through separate commands
 * @param ctx
 * @returns file writable object
 */
export function addSaveContextParser(context_: AnyListrContext): Record<string, string> {
  const exportedContext: Record<string, string> = {} as Record<string, string>;

  const config: NodeAddConfigClass = context_.config as NodeAddConfigClass;
  const exportedFields: string[] = ['tlsCertHash', 'upgradeZipHash', 'newNode'];

  exportedContext.signingCertDer = context_.signingCertDer.toString();
  exportedContext.gossipEndpoints = context_.gossipEndpoints.map(
    (endpoint: unknown): `${string}:${string}` =>
      `${(endpoint as ServiceEndpoint)._domainName}:${(endpoint as ServiceEndpoint)._port}`,
  );
  exportedContext.grpcServiceEndpoints = context_.grpcServiceEndpoints.map(
    (endpoint: unknown): `${string}:${string}` =>
      `${(endpoint as ServiceEndpoint)._domainName}:${(endpoint as ServiceEndpoint)._port}`,
  );
  exportedContext.adminKey = context_.adminKey.toString();
  // @ts-expect-error - existingNodeAliases may not be defined on config
  exportedContext.existingNodeAliases = config.existingNodeAliases;

  for (const property of exportedFields) {
    exportedContext[property] = context_[property];
  }
  return exportedContext;
}

/**
 * Initializes objects in the context from a provided string
 * Contains fields needed for adding a new node through separate commands
 * @param ctx - accumulator object
 * @param ctxData - data in string format
 * @returns file writable object
 */
export function addLoadContextParser(context_: any, contextData: any): void {
  const config: any = context_.config;
  context_.signingCertDer = new Uint8Array(contextData.signingCertDer.split(','));
  context_.gossipEndpoints = prepareEndpoints(
    context_.config.endpointType,
    contextData.gossipEndpoints,
    constants.HEDERA_NODE_INTERNAL_GOSSIP_PORT,
  );
  context_.grpcServiceEndpoints = prepareEndpoints(
    context_.config.endpointType,
    contextData.grpcServiceEndpoints,
    constants.HEDERA_NODE_EXTERNAL_GOSSIP_PORT,
  );
  context_.adminKey = PrivateKey.fromStringED25519(contextData.adminKey);
  config.nodeAlias = contextData.newNode.name;
  config.existingNodeAliases = contextData.existingNodeAliases;
  config.allNodeAliases = [...config.existingNodeAliases, contextData.newNode.name];
  config.newNodeAliases = [contextData.newNode.name];

  const fieldsToImport: string[] = ['tlsCertHash', 'upgradeZipHash', 'newNode'];

  for (const property of fieldsToImport) {
    context_[property] = contextData[property];
  }
}

export function prepareEndpoints(
  endpointType: string,
  endpoints: string[],
  defaultPort: number | string,
): ServiceEndpoint[] {
  const returnValue: ServiceEndpoint[] = [];
  for (const endpoint of endpoints) {
    const parts: string[] = endpoint.split(':');

    let url: string = '';
    let port: number | string = defaultPort;

    if (parts.length === 2) {
      url = parts[0].trim();
      port = +parts[1].trim();
    } else if (parts.length === 1) {
      url = parts[0];
    } else {
      throw new SoloError(`incorrect endpoint format. expected url:port, found ${endpoint}`);
    }

    if (endpointType.toUpperCase() === constants.ENDPOINT_TYPE_IP) {
      returnValue.push(
        new ServiceEndpoint({
          port: +port,
          ipAddressV4: parseIpAddressToUint8Array(url),
        }),
      );
    } else {
      returnValue.push(
        new ServiceEndpoint({
          port: +port,
          domainName: url,
        }),
      );
    }
  }

  return returnValue;
}

/** Adds all the types of flags as properties on the provided argv object */
export function addFlagsToArgv(
  argv: AnyYargs,
  flags: {
    required: CommandFlag[];
    optional: CommandFlag[];
  },
): AnyYargs {
  argv.required = flags.required;
  argv.optional = flags.optional;

  return argv;
}

export function resolveValidJsonFilePath(filePath: string, defaultPath?: string): string {
  if (!filePath) {
    if (defaultPath) {
      return resolveValidJsonFilePath(defaultPath);
    }

    return '';
  }

  const resolvedFilePath: string = PathEx.realPathSync(filePath);

  if (!fs.existsSync(resolvedFilePath)) {
    if (defaultPath) {
      return resolveValidJsonFilePath(defaultPath);
    }

    throw new SoloError(`File does not exist: ${filePath}`);
  }

  // If the file is empty (or size cannot be determined) then fallback on the default values
  const throttleInfo: Stats = fs.statSync(resolvedFilePath);
  if (throttleInfo.size === 0 && defaultPath) {
    return resolveValidJsonFilePath(defaultPath);
  } else if (throttleInfo.size === 0) {
    throw new SoloError(`File is empty: ${filePath}`);
  }

  try {
    // Ensure the file contains valid JSON data
    JSON.parse(fs.readFileSync(resolvedFilePath, 'utf8'));
    return resolvedFilePath;
  } catch {
    // Fallback to the default values if an error occurs due to invalid JSON data or unable to read the file size
    if (defaultPath) {
      return resolveValidJsonFilePath(defaultPath);
    }

    throw new SoloError(`Invalid JSON data in file: ${filePath}`);
  }
}

export function prepareValuesFiles(valuesFile: string): string {
  let valuesArgument: string = '';
  if (valuesFile) {
    const valuesFiles: string[] = valuesFile.split(',');
    for (const vf of valuesFiles) {
      const vfp: string = PathEx.resolve(vf);
      valuesArgument += ` --values ${vfp}`;
    }
  }

  return valuesArgument;
}

export function populateHelmArguments(valuesMapping: Record<string, string | boolean | number>): string {
  let valuesArgument: string = '';

  for (const [key, value] of Object.entries(valuesMapping)) {
    valuesArgument += ` --set ${key}=${value}`;
  }

  return valuesArgument;
}

/**
 * @param nodeAlias
 * @param consensusNodes
 * @returns context of the node
 */
export function extractContextFromConsensusNodes(
  nodeAlias: NodeAlias,
  consensusNodes: ConsensusNode[],
): Optional<string> {
  if (!consensusNodes) {
    return undefined;
  }
  if (consensusNodes.length === 0) {
    return undefined;
  }
  const consensusNode: ConsensusNode = consensusNodes.find((node): boolean => node.name === nodeAlias);
  return consensusNode ? consensusNode.context : undefined;
}

/**
 * Check if the namespace exists in the context of given consensus nodes
 * @param consensusNodes
 * @param k8Factory
 * @param namespace
 */
export async function checkNamespace(
  consensusNodes: ConsensusNode[],
  k8Factory: K8Factory,
  namespace: NamespaceName,
): Promise<void> {
  for (const consensusNode of consensusNodes) {
    const k8: K8 = k8Factory.getK8(consensusNode.context);
    if (!(await k8.namespaces().has(namespace))) {
      throw new SoloError(`namespace ${namespace} does not exist in context ${consensusNode.context}`);
    }
  }
}

/**
 * Show a banner with the chart name and version
 * @param logger
 * @param chartName The name of the chart
 * @param version The version of the chart
 * @param type The action that was performed such as 'Installed' or 'Upgraded'
 */
// TODO convert usages to leverage the logger.addMessageGroupMessage()
export function showVersionBanner(
  logger: SoloLogger,
  chartName: string,
  version: string,
  type: 'Installed' | 'Upgraded' = 'Installed',
): void {
  logger.showUser(chalk.cyan(` - ${type} ${chartName} chart, version:`, chalk.yellow(version)));
}

/**
 * Check if the input is a valid IPv4 address
 * @param input
 * @returns true if the input is a valid IPv4 address, false otherwise
 */
export function isIpV4Address(input: string): boolean {
  const ipv4Regex: RegExp =
    /^(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|1?[0-9][0-9]?)$/;
  return ipv4Regex.test(input);
}

/**
 * Convert an IPv4 address to a base64 string
 * @param ipv4 The IPv4 address to convert
 * @returns The base64 encoded string representation of the IPv4 address
 */
export function ipV4ToBase64(ipv4: string): string {
  // Split the IPv4 address into its octets
  const octets: number[] = ipv4.split('.').map((octet): number => {
    const number_: number = Number.parseInt(octet, 10);
    // eslint-disable-next-line unicorn/prefer-number-properties
    if (isNaN(number_) || number_ < 0 || number_ > 255) {
      throw new Error(`Invalid IPv4 address: ${ipv4}`);
    }
    return number_;
  });

  if (octets.length !== 4) {
    throw new Error(`Invalid IPv4 address: ${ipv4}`);
  }

  // Convert the octets to a Uint8Array
  const uint8Array: Uint8Array<ArrayBuffer> = new Uint8Array(octets);

  // Base64 encode the byte array
  return btoa(String.fromCodePoint(...uint8Array));
}

export function entityId(shard: Shard, realm: Realm, number: Long | number | string): string {
  return `${shard}.${realm}.${number}`;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  duration: Duration,
  errorMessage: string = 'Timeout',
): Promise<T> {
  return Promise.race([promise, throwAfter(duration, errorMessage)]);
}

async function throwAfter(duration: Duration, message: string = 'Timeout'): Promise<never> {
  await sleep(duration);
  throw new SoloError(message);
}

/**
 * Checks if a Docker image with the given name and tag exists locally.
 * @param imageName The name of the Docker image (e.g., "block-node-server").
 * @param imageTag The tag of the Docker image (e.g., "0.12.0").
 * @returns True if the image exists, false otherwise.
 */
export function checkDockerImageExists(imageName: string, imageTag: string): boolean {
  const fullImageName: string = `${imageName}:${imageTag}`;
  try {
    // Execute the 'docker images' command and filter by the image name
    // The --format "{{.Repository}}:{{.Tag}}" ensures consistent output
    // We use grep to filter for the exact image:tag
    const command: string = `docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "^${fullImageName}$"`;
    const output: string = execSync(command, {encoding: 'utf8', stdio: 'pipe'});
    return output.trim() === fullImageName;
  } catch (error: unknown) {
    console.error(`Error checking Docker image ${fullImageName}:`, (error as Error).message);
    return false;
  }
}

export function createDirectoryIfNotExists(file: string): void {
  const directory: string = path.dirname(file);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {recursive: true});
  }
}

export async function findMinioOperator(context: string, k8: K8Factory): Promise<ReleaseNameData> {
  const minioTenantPod: Optional<Pod> = await k8
    .getK8(context)
    .pods()
    .listForAllNamespaces(['app.kubernetes.io/name=operator', 'operator=leader'])
    .then((pods: Pod[]): Optional<Pod> => pods[0]);

  if (!minioTenantPod) {
    return {
      exists: false,
      releaseName: undefined,
    };
  }

  return {
    exists: true,
    releaseName: minioTenantPod.labels?.['app.kubernetes.io/instance'],
  };
}

export function remoteConfigsToDeploymentsTable(remoteConfigs: ConfigMap[]): string[] {
  const rows: string[] = [];
  if (remoteConfigs.length > 0) {
    rows.push('Namespace : deployment');
    for (const remoteConfig of remoteConfigs) {
      const remoteConfigData: AnyObject = yaml.parse(remoteConfig.data['remote-config-data']) as Record<
        string,
        AnyObject
      >;
      for (const cluster of remoteConfigData.clusters) {
        rows.push(`${remoteConfig.namespace.name} : ${cluster.deployment}`);
      }
    }
  }
  return rows;
}

/**
 * Prepare the values files map for each cluster
 *
 * Order of precedence:
 * 1. Chart's default values file (if chartDirectory is set)
 * 2. Profile values file
 * 3. User's values file
 * @param clusterReferences
 * @param valuesFileInput - the values file input string
 * @param chartDirectory - the chart directory
 * @param profileValuesFile - the profile values file full path
 */
export function prepareValuesFilesMap(
  clusterReferences: ClusterReferences,
  chartDirectory?: string,
  profileValuesFile?: string,
  valuesFileInput?: string,
): Record<ClusterReferenceName, string> {
  // initialize the map with an empty array for each cluster-ref
  const valuesFiles: Record<ClusterReferenceName, string> = {
    [Flags.KEY_COMMON]: '',
  };
  for (const [clusterReference] of clusterReferences) {
    valuesFiles[clusterReference] = '';
  }

  // add the chart's default values file for each cluster-ref if chartDirectory is set
  // this should be the first in the list of values files as it will be overridden by user's input
  if (chartDirectory) {
    const chartValuesFile: string = PathEx.join(chartDirectory, 'solo-deployment', 'values.yaml');
    for (const clusterReference in valuesFiles) {
      valuesFiles[clusterReference] += ` --values ${chartValuesFile}`;
    }
  }

  if (profileValuesFile) {
    const parsed: Record<string, Array<string>> = Flags.parseValuesFilesInput(profileValuesFile);
    for (const [clusterReference, files] of Object.entries(parsed)) {
      let vf: string = '';
      for (const file of files) {
        vf += ` --values ${file}`;
      }

      if (clusterReference === Flags.KEY_COMMON) {
        for (const [cf] of Object.entries(valuesFiles)) {
          valuesFiles[cf] += vf;
        }
      } else {
        valuesFiles[clusterReference] += vf;
      }
    }
  }

  if (valuesFileInput) {
    const parsed: Record<string, Array<string>> = Flags.parseValuesFilesInput(valuesFileInput);
    for (const [clusterReference, files] of Object.entries(parsed)) {
      let vf: string = '';
      for (const file of files) {
        vf += ` --values ${file}`;
      }

      if (clusterReference === Flags.KEY_COMMON) {
        for (const [clusterReference_] of Object.entries(valuesFiles)) {
          valuesFiles[clusterReference_] += vf;
        }
      } else {
        valuesFiles[clusterReference] += vf;
      }
    }
  }

  if (Object.keys(valuesFiles).length > 1) {
    // delete the common key if there is another cluster to use
    delete valuesFiles[Flags.KEY_COMMON];
  }

  return valuesFiles;
}

/**
 * Prepare the values files map for each cluster
 *
 * Order of precedence:
 * 1. Chart's default values file (if chartDirectory is set)
 * 2. Base values files (applied after chart defaults, before the generated profile values file)
 * 3. Profile values file
 * 4. User's values file
 * @param clusterReferences
 * @param chartDirectory - the chart directory
 * @param profileValuesFile - mapping of clusterRef to the profile values file full path
 * @param valuesFileInput - the values file input string
 * @param baseValuesFiles - optional list of values file paths inserted between chart defaults and profile values
 */
export function prepareValuesFilesMapMultipleCluster(
  clusterReferences: ClusterReferences,
  chartDirectory?: string,
  profileValuesFile?: Record<ClusterReferenceName, string>,
  valuesFileInput?: string,
  baseValuesFiles?: string[],
): Record<ClusterReferenceName, string> {
  // initialize the map with an empty array for each cluster-ref
  const valuesFiles: Record<ClusterReferenceName, string> = {[Flags.KEY_COMMON]: ''};
  for (const [clusterReference] of clusterReferences) {
    valuesFiles[clusterReference] = '';
  }

  // add the chart's default values file for each cluster-ref if chartDirectory is set
  // this should be the first in the list of values files as it will be overridden by user's input
  if (chartDirectory) {
    const chartValuesFile: string = PathEx.join(chartDirectory, 'solo-deployment', 'values.yaml');
    for (const clusterReference in valuesFiles) {
      valuesFiles[clusterReference] += ` --values ${chartValuesFile}`;
    }
  }

  // add base values files (e.g. component defaults) after chart defaults but before profile values
  if (baseValuesFiles) {
    for (const file of baseValuesFiles) {
      for (const clusterReference in valuesFiles) {
        valuesFiles[clusterReference] += ` --values ${file}`;
      }
    }
  }

  if (profileValuesFile) {
    for (const [clusterReference, file] of Object.entries(profileValuesFile)) {
      const valuesArgument: string = ` --values ${file}`;

      if (clusterReference === Flags.KEY_COMMON) {
        for (const clusterReference_ of Object.keys(valuesFiles)) {
          valuesFiles[clusterReference_] += valuesArgument;
        }
      } else {
        valuesFiles[clusterReference] += valuesArgument;
      }
    }
  }

  if (valuesFileInput) {
    const parsed: Record<string, Array<string>> = Flags.parseValuesFilesInput(valuesFileInput);
    for (const [clusterReference, files] of Object.entries(parsed)) {
      let vf: string = '';
      for (const file of files) {
        vf += ` --values ${file}`;
      }

      if (clusterReference === Flags.KEY_COMMON) {
        for (const [clusterReference_] of Object.entries(valuesFiles)) {
          valuesFiles[clusterReference_] += vf;
        }
      } else {
        valuesFiles[clusterReference] += vf;
      }
    }
  }

  if (Object.keys(valuesFiles).length > 1) {
    // delete the common key if there is another cluster to use
    delete valuesFiles[Flags.KEY_COMMON];
  }

  return valuesFiles;
}

/**
 * @param consensusNode - the targeted consensus node
 * @param logger
 * @param k8Factory
 */
export async function createAndCopyBlockNodeJsonFileForConsensusNode(
  consensusNode: ConsensusNode,
  logger: SoloLogger,
  k8Factory: K8Factory,
): Promise<void> {
  const {
    nodeId,
    context,
    name: nodeAlias,
    blockNodeMap,
    externalBlockNodeMap,
    namespace: namespaceNameAsString,
  } = consensusNode;

  const namespace: NamespaceName = NamespaceName.of(namespaceNameAsString);

  const blockNodesJsonData: string = new BlockNodesJsonWrapper(blockNodeMap, externalBlockNodeMap).toJSON();

  const blockNodesJsonFilename: string = `${constants.BLOCK_NODES_JSON_FILE.replace('.json', '')}-${nodeId}.json`;
  const blockNodesJsonPath: string = PathEx.join(constants.SOLO_CACHE_DIR, blockNodesJsonFilename);

  fs.writeFileSync(blockNodesJsonPath, JSON.stringify(JSON.parse(blockNodesJsonData), undefined, 2));

  // Check if the file exists before copying
  if (!fs.existsSync(blockNodesJsonPath)) {
    logger.warn(`Block nodes JSON file not found: ${blockNodesJsonPath}`);
    return;
  }

  const k8: K8 = k8Factory.getK8(context);

  const container: Container = await new K8Helper(context).getConsensusNodeRootContainer(namespace, nodeAlias);

  await container.execContainer('pwd');

  const targetDirectory: string = `${constants.HEDERA_HAPI_PATH}/data/config`;

  await container.execContainer(`mkdir -p ${targetDirectory}`);

  // Copy the file and rename it to block-nodes.json in the destination
  await container.copyTo(blockNodesJsonPath, targetDirectory);

  // If using node-specific files, rename the copied file to the standard name
  const sourceFilename: string = path.basename(blockNodesJsonPath);
  await container.execContainer(
    `mv ${targetDirectory}/${sourceFilename} ${targetDirectory}/${constants.BLOCK_NODES_JSON_FILE}`,
  );

  const applicationPropertiesFilePath: string = `${constants.HEDERA_HAPI_PATH}/data/config/application.properties`;

  const applicationPropertiesData: string = await container.execContainer(`cat ${applicationPropertiesFilePath}`);

  const lines: string[] = applicationPropertiesData.split('\n');

  // Remove line to enable overriding below.
  for (const line of lines) {
    if (line === 'blockStream.streamMode=RECORDS') {
      lines.splice(lines.indexOf(line), 1);
    }
  }

  // Switch to block streaming.

  if (!lines.some((line): boolean => line.startsWith('blockStream.streamMode='))) {
    lines.push(`blockStream.streamMode=${constants.BLOCK_STREAM_STREAM_MODE}`);
  }

  if (!lines.some((line): boolean => line.startsWith('blockStream.writerMode='))) {
    lines.push(`blockStream.writerMode=${constants.BLOCK_STREAM_WRITER_MODE}`);
  }

  await k8.configMaps().update(namespace, 'network-node-data-config-cm', {
    ['applicationProperties']: lines.join('\n'),
    ['application.properties']: lines.join('\n'),
  });

  const configName: string = `network-${nodeAlias}-data-config-cm`;
  const configMapExists: boolean = await k8.configMaps().exists(namespace, configName);

  await (configMapExists
    ? k8.configMaps().update(namespace, configName, {'block-nodes.json': blockNodesJsonData})
    : k8.configMaps().create(namespace, configName, {}, {'block-nodes.json': blockNodesJsonData}));

  logger.debug(`Copied block-nodes configuration to consensus node ${consensusNode.name}`);

  const updatedApplicationPropertiesFilePath: string = PathEx.join(constants.SOLO_CACHE_DIR, 'application.properties');

  fs.writeFileSync(updatedApplicationPropertiesFilePath, lines.join('\n'));
  await container.copyTo(updatedApplicationPropertiesFilePath, targetDirectory);
}

/**
 * Build comprehensive per-node environment variables structure for Helm values file.
 * This unified function handles all extraEnv scenarios to avoid duplication and Helm --set issues.
 *
 * @param consensusNodes - list of consensus nodes
 * @param options - configuration options for different extraEnv scenarios
 * @returns Object suitable for YAML serialization with hedera.nodes[X].root.extraEnv
 */
type EnvironmentVariable = {name: string; value: string};
type PerNodeExtraEnvironmentOptions = {
  wrapsEnabled?: boolean;
  tss?: {wraps: {artifactsFolderName: string}};
  debugNodeAlias?: NodeAlias;
  useJavaMainClass?: boolean; // for tools/local builds
  additionalEnvironmentVariables?: Record<NodeAlias, EnvironmentVariable[]>;
  /** Existing extraEnv entries read from previously-applied values files. These are used as the
   * base so they are not lost when Helm replaces array fields. Solo-generated entries
   * (wraps, debug, etc.) are layered on top and will override conflicts. */
  baseExtraEnvironmentVariables?: Record<NodeAlias, EnvironmentVariable[]>;
  additionalNodeValues?: Record<
    NodeAlias,
    {
      name?: NodeAlias;
      nodeId?: NodeId;
      accountId?: string;
      blockNodesJson?: string;
    }
  >;
};
type PerNodeExtraEnvironmentValues = {
  hedera: {
    nodes: Array<{
      root?: {extraEnv: EnvironmentVariable[]};
      name?: NodeAlias;
      nodeId?: NodeId;
      accountId?: string;
      blockNodesJson?: string;
    }>;
  };
};

/**
 * Ensures JAVA_OPTS doesn't conflict with JAVA_HEAP_MIN/MAX by removing any
 * existing -Xms/-Xmx arguments to prevent dual heap size specifications.
 *
 * @param javaOptions - The current JAVA_OPTS value
 * @returns Cleaned JAVA_OPTS without heap size arguments
 */
export function sanitizeJavaOptionsForHeapSettings(javaOptions: string): string {
  // Remove any existing -Xms or -Xmx arguments to prevent conflicts
  // with JAVA_HEAP_MIN and JAVA_HEAP_MAX environment variables.
  // Supports both attached (-Xms512m, -Xmx2g) and spaced
  // (-Xms 512m, -Xmx 2g) JVM option forms.
  return javaOptions
    .replaceAll(/(^|\s)-Xms\s*\S+/g, '$1')
    .replaceAll(/(^|\s)-Xmx\s*\S+/g, '$1')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Helper function to set or update an environment variable in the extraEnvironmentVariables array
 */
function setExtraEnvironmentVariable(
  extraEnvironmentVariables: EnvironmentVariable[],
  name: string,
  value: string,
): void {
  const environmentVariableIndex: number = extraEnvironmentVariables.findIndex(
    (environmentVariable): boolean => environmentVariable.name === name,
  );
  if (environmentVariableIndex === -1) {
    extraEnvironmentVariables.push({name, value});
  } else {
    extraEnvironmentVariables[environmentVariableIndex].value = value;
  }
}

export function buildPerNodeExtraEnvironmentValuesStructure(
  consensusNodes: ConsensusNode[],
  options: PerNodeExtraEnvironmentOptions = {},
): PerNodeExtraEnvironmentValues {
  const hedera: PerNodeExtraEnvironmentValues['hedera'] = {nodes: []};

  for (const [nodeIndex, consensusNode] of consensusNodes.entries()) {
    // Use the cluster-local position in the provided node list as the Helm chart index.
    // `nodeId` is not guaranteed to match `hedera.nodes[...]` array positions.
    // Start with env vars from existing values files so Helm array replacement doesn't drop them.
    // Solo-generated entries below will override any conflicts.
    const extraEnvironmentVariables: EnvironmentVariable[] = [
      ...(options.baseExtraEnvironmentVariables?.[consensusNode.name] ?? []),
    ];

    // Add JAVA_MAIN_CLASS for tools/local builds
    if (options.useJavaMainClass) {
      setExtraEnvironmentVariable(extraEnvironmentVariables, 'JAVA_MAIN_CLASS', 'com.swirlds.platform.Browser');
    }

    // Add TSS wraps if enabled
    if (options.wrapsEnabled && options.tss) {
      const wrapPath: string = `${constants.HEDERA_HAPI_PATH}/${options.tss.wraps.artifactsFolderName}`;
      setExtraEnvironmentVariable(extraEnvironmentVariables, 'TSS_LIB_WRAPS_ARTIFACTS_PATH', wrapPath);
    }

    // Override JAVA_OPTS for debug mode if this is the debug node
    if (options.debugNodeAlias === consensusNode.name) {
      const debugJavaOptions: string = `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:${constants.JVM_DEBUG_PORT}`;
      const javaOptionsIndex: number = extraEnvironmentVariables.findIndex(
        (environmentVariable): boolean => environmentVariable.name === 'JAVA_OPTS',
      );
      if (javaOptionsIndex === -1) {
        extraEnvironmentVariables.push({
          name: 'JAVA_OPTS',
          value: debugJavaOptions,
        });
      } else {
        extraEnvironmentVariables[javaOptionsIndex].value =
          `${debugJavaOptions} ${extraEnvironmentVariables[javaOptionsIndex].value}`.trim();
      }
    }

    // Add any additional env vars for this specific node (overwrite duplicates)
    if (options.additionalEnvironmentVariables && options.additionalEnvironmentVariables[consensusNode.name]) {
      for (const additionalEnvironmentVariable of options.additionalEnvironmentVariables[consensusNode.name]) {
        setExtraEnvironmentVariable(
          extraEnvironmentVariables,
          additionalEnvironmentVariable.name,
          additionalEnvironmentVariable.value,
        );
      }
    }

    // Final sanitization: remove -Xms/-Xmx from JAVA_OPTS regardless of which source introduced them.
    // This covers base values files, debug-node prepend, and additional env vars so that
    // JAVA_HEAP_MIN/JAVA_HEAP_MAX remain the sole authoritative heap sizing source.
    const finalJavaOptionsIndex: number = extraEnvironmentVariables.findIndex(
      (environmentVariable): boolean => environmentVariable.name === 'JAVA_OPTS',
    );
    if (finalJavaOptionsIndex !== -1) {
      extraEnvironmentVariables[finalJavaOptionsIndex].value = sanitizeJavaOptionsForHeapSettings(
        extraEnvironmentVariables[finalJavaOptionsIndex].value,
      );
    }

    // Ensure the hedera.nodes array has enough elements
    while (hedera.nodes.length <= nodeIndex) {
      hedera.nodes.push({});
    }

    const nodeValues: PerNodeExtraEnvironmentValues['hedera']['nodes'][number] = {};
    if (extraEnvironmentVariables.length > 0) {
      nodeValues.root = {extraEnv: extraEnvironmentVariables};
    }

    const additionalNodeValues:
      | {name?: NodeAlias; nodeId?: NodeId; accountId?: string; blockNodesJson?: string}
      | undefined = options.additionalNodeValues?.[consensusNode.name];
    if (additionalNodeValues?.name) {
      nodeValues.name = additionalNodeValues.name;
    }
    if (typeof additionalNodeValues?.nodeId === 'number') {
      nodeValues.nodeId = additionalNodeValues.nodeId;
    }
    if (additionalNodeValues?.accountId) {
      nodeValues.accountId = additionalNodeValues.accountId;
    }
    if (additionalNodeValues?.blockNodesJson) {
      nodeValues.blockNodesJson = additionalNodeValues.blockNodesJson;
    }

    hedera.nodes[nodeIndex] = nodeValues;
  }

  return {hedera};
}

/**
 * Generate a temporary YAML values file for per-node extraEnv configuration.
 * Returns the file path to be used with helm --values.
 *
 * @param consensusNodes - list of consensus nodes
 * @param options - extraEnv configuration options
 * @param cacheDirectory - directory to write the temporary file
 * @returns path to the generated YAML file
 */
export function generateExtraEnvironmentValuesFile(
  consensusNodes: ConsensusNode[],
  options: PerNodeExtraEnvironmentOptions = {},
  cacheDirectory: string,
): string {
  const perNodeExtraEnvironmentValues: PerNodeExtraEnvironmentValues = buildPerNodeExtraEnvironmentValuesStructure(
    consensusNodes,
    options,
  );

  const filename: string = `per-node-extra-env-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`;
  const filePath: string = PathEx.join(cacheDirectory, filename);

  const yamlContent: string = yaml.stringify(perNodeExtraEnvironmentValues, {indent: 2});
  fs.writeFileSync(filePath, yamlContent);

  return filePath;
}

/**
 * Parse `--values <path>` entries from a helm values argument string.
 * Handles both quoted and unquoted paths.
 */
export function parseValuesFilePaths(valuesArgument: string): string[] {
  const filePaths: string[] = [];
  const regex: RegExp = /--values\s+"([^"]+)"|--values\s+(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(valuesArgument)) !== null) {
    filePaths.push(match[1] ?? match[2]);
  }
  return filePaths;
}

/**
 * Read YAML helm values files and extract extraEnv entries, keyed by node alias.
 *
 * Two sources are read per file (in priority order, lower → higher):
 *  1. `defaults.root.extraEnv` — applied to every node as a baseline
 *  2. `hedera.nodes[i].root.extraEnv` — per-node overrides
 *
 * Later files in the list take precedence over earlier ones for duplicate variable names,
 * matching the same semantics as `helm --values` ordering.
 */
export function extractExtraEnvironmentFromValuesFiles(
  filePaths: string[],
  consensusNodes: ConsensusNode[],
): Record<NodeAlias, EnvironmentVariable[]> {
  const result: Record<NodeAlias, EnvironmentVariable[]> = {};

  /**
   * Merge a list of env vars into the accumulated result for a node alias.
   * Later calls (later files) override earlier ones for the same variable name.
   */
  function mergeIntoResult(nodeAlias: NodeAlias, environmentVariables: EnvironmentVariable[]): void {
    if (!result[nodeAlias]) {
      result[nodeAlias] = [];
    }
    for (const environmentVariable of environmentVariables) {
      const existingIndex: number = result[nodeAlias].findIndex(
        (variable: EnvironmentVariable): boolean => variable.name === environmentVariable.name,
      );
      const environmentVariableClone: EnvironmentVariable = {...environmentVariable};
      if (existingIndex === -1) {
        result[nodeAlias].push(environmentVariableClone);
      } else {
        result[nodeAlias][existingIndex] = environmentVariableClone;
      }
    }
  }

  /**
   * Safely extract a `root.extraEnv` array from a parsed YAML object section.
   */
  function extractExtraEnvironmentArray(rootSection: unknown): EnvironmentVariable[] {
    if (!rootSection || typeof rootSection !== 'object') {
      return [];
    }
    const extraEnvironmentArray: unknown = (rootSection as Record<string, unknown>).extraEnv;
    if (!Array.isArray(extraEnvironmentArray)) {
      return [];
    }
    const environmentVariables: EnvironmentVariable[] = [];
    for (const entry of extraEnvironmentArray) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const entryRecord: Record<string, unknown> = entry as Record<string, unknown>;
      if (typeof entryRecord.name !== 'string' || typeof entryRecord.value !== 'string') {
        continue;
      }
      environmentVariables.push({name: entryRecord.name, value: entryRecord.value});
    }
    return environmentVariables;
  }

  for (const filePath of filePaths) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue; // file may not exist yet; skip silently
    }

    let parsedValues: unknown;
    try {
      parsedValues = yaml.parse(content);
    } catch {
      continue;
    }

    if (!parsedValues || typeof parsedValues !== 'object') {
      continue;
    }

    const parsedRecord: Record<string, unknown> = parsedValues as Record<string, unknown>;

    // 1. Extract defaults.root.extraEnv — applies to all nodes (lowest priority within this file).
    const defaultsSection: unknown = parsedRecord.defaults;
    if (defaultsSection && typeof defaultsSection === 'object') {
      const defaultsRootSection: unknown = (defaultsSection as Record<string, unknown>).root;
      const defaultsEnvironmentVariables: EnvironmentVariable[] = extractExtraEnvironmentArray(defaultsRootSection);
      if (defaultsEnvironmentVariables.length > 0) {
        for (const consensusNode of consensusNodes) {
          mergeIntoResult(consensusNode.name, defaultsEnvironmentVariables);
        }
      }
    }

    // 2. Extract hedera.nodes[i].root.extraEnv — per-node overrides (higher priority).
    const hederaSection: unknown = parsedRecord.hedera;
    if (!hederaSection || typeof hederaSection !== 'object') {
      continue;
    }

    const nodesArray: unknown = (hederaSection as Record<string, unknown>).nodes;
    if (!Array.isArray(nodesArray)) {
      continue;
    }

    for (const [helmNodeIndex, consensusNode] of consensusNodes.entries()) {
      const nodeEntry: unknown = nodesArray[helmNodeIndex];
      if (!nodeEntry || typeof nodeEntry !== 'object') {
        continue;
      }
      const nodeRootSection: unknown = (nodeEntry as Record<string, unknown>).root;
      const nodeEnvironmentVariables: EnvironmentVariable[] = extractExtraEnvironmentArray(nodeRootSection);
      if (nodeEnvironmentVariables.length > 0) {
        mergeIntoResult(consensusNode.name, nodeEnvironmentVariables);
      }
    }
  }

  return result;
}

/**
 * Read a YAML Helm values file and extract the `blockNodesJson` field for each consensus node,
 * keyed by node alias. Uses the consensusNodes array index as the `hedera.nodes` Helm index
 * (matching the semantics of `buildPerNodeExtraEnvironmentValuesStructure`).
 *
 * Returns an empty record if the file cannot be read, cannot be parsed, or contains no
 * `hedera.nodes` array.
 */
export function extractPerNodeBlockNodesJsonFromValuesFile(
  valuesFilePath: string,
  consensusNodes: ConsensusNode[],
): Record<NodeAlias, string> {
  const result: Record<NodeAlias, string> = {};

  let content: string;
  try {
    content = fs.readFileSync(valuesFilePath, 'utf8');
  } catch {
    return result;
  }

  let parsedValues: unknown;
  try {
    parsedValues = yaml.parse(content);
  } catch {
    return result;
  }

  if (!parsedValues || typeof parsedValues !== 'object') {
    return result;
  }

  const hederaSection: unknown = (parsedValues as Record<string, unknown>).hedera;
  if (!hederaSection || typeof hederaSection !== 'object') {
    return result;
  }

  const nodesArray: unknown = (hederaSection as Record<string, unknown>).nodes;
  if (!Array.isArray(nodesArray)) {
    return result;
  }

  for (const [helmNodeIndex, consensusNode] of consensusNodes.entries()) {
    const nodeEntry: unknown = nodesArray[helmNodeIndex];
    if (!nodeEntry || typeof nodeEntry !== 'object') {
      continue;
    }
    const blockNodesJson: unknown = (nodeEntry as Record<string, unknown>).blockNodesJson;
    if (typeof blockNodesJson === 'string') {
      result[consensusNode.name] = blockNodesJson;
    }
  }

  return result;
}

/**
 * Extracts per-node identity fields (name, nodeId, accountId) from a Helm values file,
 * keyed by node alias. Uses the consensusNodes array index as the `hedera.nodes` Helm index
 * (matching the semantics of `buildPerNodeExtraEnvironmentValuesStructure`).
 *
 * This allows callers to re-use the configured account IDs from a previously generated
 * profile values file instead of recomputing defaults, preserving any customisations made
 * via node transactions.
 *
 * Returns an empty record if the file cannot be read, cannot be parsed, or contains no
 * `hedera.nodes` array.
 */
export interface PerNodeIdentity {
  name?: NodeAlias;
  nodeId?: NodeId;
  accountId?: string;
}

export function extractPerNodeIdentityFromValuesFile(
  valuesFilePath: string,
  consensusNodes: ConsensusNode[],
): Record<NodeAlias, PerNodeIdentity> {
  const result: Record<NodeAlias, PerNodeIdentity> = {};

  let content: string;
  try {
    content = fs.readFileSync(valuesFilePath, 'utf8');
  } catch {
    return result;
  }

  let parsedValues: unknown;
  try {
    parsedValues = yaml.parse(content);
  } catch {
    return result;
  }

  if (!parsedValues || typeof parsedValues !== 'object') {
    return result;
  }

  const hederaSection: unknown = (parsedValues as Record<string, unknown>).hedera;
  if (!hederaSection || typeof hederaSection !== 'object') {
    return result;
  }

  const nodesArray: unknown = (hederaSection as Record<string, unknown>).nodes;
  if (!Array.isArray(nodesArray)) {
    return result;
  }

  for (const [helmNodeIndex, consensusNode] of consensusNodes.entries()) {
    const nodeEntry: unknown = nodesArray[helmNodeIndex];
    if (!nodeEntry || typeof nodeEntry !== 'object') {
      continue;
    }
    const entry: Record<string, unknown> = nodeEntry as Record<string, unknown>;
    const identity: PerNodeIdentity = {};
    if (typeof entry.name === 'string') {
      identity.name = entry.name as NodeAlias;
    }
    if (typeof entry.nodeId === 'number') {
      identity.nodeId = entry.nodeId as NodeId;
    } else if (typeof entry.nodeId === 'string') {
      const parsed: number = Number.parseInt(entry.nodeId, 10);
      if (!Number.isNaN(parsed)) {
        identity.nodeId = parsed as NodeId;
      }
    }
    if (typeof entry.accountId === 'string') {
      identity.accountId = entry.accountId;
    }
    result[consensusNode.name] = identity;
  }

  return result;
}
