// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';
import {SoloError} from './errors/solo-error.js';
import * as semver from 'semver';
import {Templates} from './templates.js';
import * as constants from './constants.js';
import {PrivateKey, ServiceEndpoint, type Long} from '@hiero-ledger/sdk';
import {type AnyObject, type NodeAlias, type NodeAliases} from '../types/aliases.js';
import {type CommandFlag} from '../types/flag-types.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type Duration} from './time/duration.js';
import {type NodeAddConfigClass} from '../commands/node/config-interfaces/node-add-config-class.js';
import {type ConsensusNode} from './model/consensus-node.js';
import {type Optional, type ReleaseNameData} from '../types/index.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import chalk from 'chalk';
import {PathEx} from '../business/utils/path-ex.js';
import {type ConfigManager} from './config-manager.js';
import {Flags as flags} from '../commands/flags.js';
import {type Realm, type Shard} from './../types/index.js';
import {execSync} from 'node:child_process';
import {type Pod} from '../integration/kube/resources/pod/pod.js';
import yaml from 'yaml';
import {type ConfigMap} from '../integration/kube/resources/config-map/config-map.js';
import {type K8} from '../integration/kube/k8.js';

export function getInternalAddress(
  releaseVersion: semver.SemVer | string,
  namespaceName: NamespaceName,
  nodeAlias: NodeAlias,
): string {
  // @ts-expect-error TS2353: Object literal may only specify known properties
  return semver.gte(releaseVersion, '0.58.5', {includePrerelease: true})
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

export function splitFlagInput(input: string, separator: string = ','): any[] | string[] {
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
  const dateDirectory: string = util.format(
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

export function isNumeric(string_: string): boolean {
  if (typeof string_ !== 'string') {
    return false;
  } // we only process strings!
  return (
    !Number.isNaN(Number.parseInt(string_)) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !Number.isNaN(Number.parseFloat(string_))
  ); // ...and ensure strings of whitespace fail
}

export function getEnvironmentValue(environmentVariableArray: string[], name: string): string {
  const kvPair: string = environmentVariableArray.find((v): boolean => v.startsWith(`${name}=`));
  return kvPair ? kvPair.split('=')[1] : null;
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
 * Add debug options to valuesArg used by helm chart
 * @param valuesArg the valuesArg to update
 * @param debugNodeAlias the node ID to attach the debugger to
 * @param index the index of extraEnv to add the debug options to
 * @returns updated valuesArg
 */
export function addDebugOptions(valuesArgument: string, debugNodeAlias: NodeAlias, index: number = 0): string {
  if (debugNodeAlias) {
    const nodeId: number = Templates.nodeIdFromNodeAlias(debugNodeAlias);
    valuesArgument += ` --set "hedera.nodes[${nodeId}].root.extraEnv[${index}].name=JAVA_OPTS"`;
    valuesArgument += String.raw` --set "hedera.nodes[${nodeId}].root.extraEnv[${index}].value=-agentlib:jdwp=transport=dt_socket\,server=y\,suspend=y\,address=*:${constants.JVM_DEBUG_PORT}"`;
  }
  return valuesArgument;
}

/**
 * Returns an object that can be written to a file without data loss.
 * Contains fields needed for adding a new node through separate commands
 * @param ctx
 * @returns file writable object
 */
export function addSaveContextParser(context_: any): Record<string, string> {
  const exportedContext: Record<string, string> = {} as Record<string, string>;

  const config: NodeAddConfigClass = context_.config as NodeAddConfigClass;
  const exportedFields: string[] = ['tlsCertHash', 'upgradeZipHash', 'newNode'];

  exportedContext.signingCertDer = context_.signingCertDer.toString();
  exportedContext.gossipEndpoints = context_.gossipEndpoints.map(
    (ep: any): `${any}:${any}` => `${ep.getDomainName}:${ep.getPort}`,
  );
  exportedContext.grpcServiceEndpoints = context_.grpcServiceEndpoints.map(
    (ep: any): `${any}:${any}` => `${ep.getDomainName}:${ep.getPort}`,
  );
  exportedContext.adminKey = context_.adminKey.toString();
  // @ts-ignore
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

export function prepareEndpoints(endpointType: string, endpoints: string[], defaultPort: number | string) {
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
  argv: any,
  flags: {
    required: CommandFlag[];
    optional: CommandFlag[];
  },
): any {
  argv.required = flags.required;
  argv.optional = flags.optional;

  return argv;
}

export function resolveValidJsonFilePath(filePath: string, defaultPath?: string): string {
  if (!filePath) {
    if (defaultPath) {
      return resolveValidJsonFilePath(defaultPath, null);
    }

    return '';
  }

  const resolvedFilePath: string = PathEx.realPathSync(filePath);

  if (!fs.existsSync(resolvedFilePath)) {
    if (defaultPath) {
      return resolveValidJsonFilePath(defaultPath, null);
    }

    throw new SoloError(`File does not exist: ${filePath}`);
  }

  // If the file is empty (or size cannot be determined) then fallback on the default values
  const throttleInfo = fs.statSync(resolvedFilePath);
  if (throttleInfo.size === 0 && defaultPath) {
    return resolveValidJsonFilePath(defaultPath, null);
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
      return resolveValidJsonFilePath(defaultPath, null);
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
  } catch (error: any) {
    console.error(`Error checking Docker image ${fullImageName}:`, error.message);
    return false;
  }
}

export function createDirectoryIfNotExists(file: string): void {
  const directory: string = file.slice(0, Math.max(0, file.lastIndexOf('/')));
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
