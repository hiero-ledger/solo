/**
 * SPDX-License-Identifier: Apache-2.0
 */
import type * as k8s from '@kubernetes/client-node';
import type {PodName, TarCreateFilter} from '../../types/aliases.js';
import type {ExtendedNetServer, Optional} from '../../types/index.js';
import type TDirectoryData from './t_directory_data.js';
import {type V1Lease} from '@kubernetes/client-node';
import {type Namespace} from '../config/remote/types.js';
import {type Namespaces} from './namespaces.js';

export default interface K8 {
  namespaces(): Namespaces;

  /**
   * Create a new namespace
   */
  createNamespace(name: string): Promise<boolean>;

  /**
   * Delete a namespace
   * @param name - name of the namespace
   */
  deleteNamespace(name: string): Promise<boolean>;

  /** Get a list of namespaces */
  getNamespaces(): Promise<string[]>;

  /**
   * Returns true if a namespace exists with the given name
   * @param namespace namespace name
   */
  hasNamespace(namespace: string): Promise<any>;

  /**
   * Get a podName by name
   * @param name - podName name
   */
  getPodByName(name: string): Promise<k8s.V1Pod>;

  /**
   * Get pods by labels
   * @param labels - list of labels
   */
  getPodsByLabel(labels: string[]): Promise<any>;

  /**
   * Get secrets by labels
   * @param labels - list of labels
   */
  getSecretsByLabel(labels: string[]): Promise<any>;

  /**
   * Get a svc by name
   * @param name - svc name
   */
  getSvcByName(name: string): Promise<k8s.V1Service>;

  listSvcs(namespace: string, labels: string[]): Promise<k8s.V1Service[]>;

  /**
   * Get a list of clusters
   * @returns a list of cluster names
   */
  getClusters(): string[];

  /**
   * Get a list of contexts
   * @returns a list of context names
   */
  getContextNames(): string[];

  /**
   * List files and directories in a container
   *
   * It runs ls -la on the specified path and returns a list of object containing the entries.
   * For example:
   * [{
   *    directory: false,
   *    owner: hedera,
   *    group: hedera,
   *    size: 121,
   *    modifiedAt: Jan 15 13:50
   *    name: config.txt
   * }]
   *
   * @param podName
   * @param containerName
   * @param destPath - path inside the container
   * @returns a promise that returns array of directory entries, custom object
   */
  listDir(podName: PodName, containerName: string, destPath: string): Promise<any[] | TDirectoryData[]>;

  /**
   * Check if a filepath exists in the container
   * @param podName
   * @param containerName
   * @param destPath - path inside the container
   * @param [filters] - an object with metadata fields and value
   */
  hasFile(podName: PodName, containerName: string, destPath: string, filters?: object): Promise<boolean>;

  /**
   * Check if a directory path exists in the container
   * @param podName
   * @param containerName
   * @param destPath - path inside the container
   */
  hasDir(podName: string, containerName: string, destPath: string): Promise<boolean>;

  mkdir(podName: PodName, containerName: string, destPath: string): Promise<string>;

  /**
   * Copy a file into a container
   *
   * It overwrites any existing file inside the container at the destination directory
   *
   * @param podName
   * @param containerName
   * @param srcPath - source file path in the local
   * @param destDir - destination directory in the container
   * @param [filter] - the filter to pass to tar to keep or skip files or directories
   * @returns a Promise that performs the copy operation
   */
  copyTo(
    podName: PodName,
    containerName: string,
    srcPath: string,
    destDir: string,
    filter?: TarCreateFilter | undefined,
  ): Promise<boolean>;

  /**
   * Copy a file from a container
   *
   * It overwrites any existing file at the destination directory
   *
   * @param podName
   * @param containerName
   * @param srcPath - source file path in the container
   * @param destDir - destination directory in the local
   */
  copyFrom(podName: PodName, containerName: string, srcPath: string, destDir: string): Promise<unknown>;

  /**
   * Invoke sh command within a container and return the console output as string
   * @param podName
   * @param containerName
   * @param command - sh commands as an array to be run within the containerName (e.g 'ls -la /opt/hgcapp')
   * @returns console output as string
   */
  execContainer(podName: string, containerName: string, command: string | string[]): Promise<string>;

  /**
   * Port forward a port from a pod to localhost
   *
   * This simple server just forwards traffic from itself to a service running in kubernetes
   * -> localhost:localPort -> port-forward-tunnel -> kubernetes-pod:targetPort
   */
  portForward(podName: PodName, localPort: number, podPort: number): Promise<ExtendedNetServer>;

  /**
   * Stop the port forwarder server
   *
   * @param server - an instance of server returned by portForward method
   * @param [maxAttempts] - the maximum number of attempts to check if the server is stopped
   * @param [timeout] - the delay between checks in milliseconds
   */
  stopPortForward(server: ExtendedNetServer, maxAttempts?, timeout?): Promise<void>;

  waitForPods(
    phases?,
    labels?: string[],
    podCount?,
    maxAttempts?,
    delay?,
    podItemPredicate?: (items: k8s.V1Pod) => boolean,
    namespace?: string,
  ): Promise<k8s.V1Pod[]>;

  /**
   * Check if pod is ready
   * @param [labels] - pod labels
   * @param [podCount] - number of pod expected
   * @param [maxAttempts] - maximum attempts to check
   * @param [delay] - delay between checks in milliseconds
   * @param [namespace] - namespace
   */
  waitForPodReady(labels: string[], podCount?, maxAttempts?, delay?, namespace?: string): Promise<k8s.V1Pod[]>;

  /**
   * Get a list of persistent volume claim names for the given namespace
   * @param namespace - the namespace of the persistent volume claims to return
   * @param [labels] - labels
   * @returns list of persistent volume claim names
   */
  listPvcsByNamespace(namespace: string, labels?: string[]): Promise<string[]>;

  /**
   * Get a list of secrets for the given namespace
   * @param namespace - the namespace of the secrets to return
   * @param [labels] - labels
   * @returns list of secret names
   */
  listSecretsByNamespace(namespace: string, labels?: string[]): Promise<string[]>;

  /**
   * Delete a persistent volume claim
   * @param name - the name of the persistent volume claim to delete
   * @param namespace - the namespace of the persistent volume claim to delete
   * @returns true if the persistent volume claim was deleted
   */
  deletePvc(name: string, namespace: string): Promise<boolean>;

  testContextConnection(context: string): Promise<boolean>;

  /**
   * retrieve the secret of the given namespace and label selector, if there is more than one, it returns the first
   * @param namespace - the namespace of the secret to search for
   * @param labelSelector - the label selector used to fetch the Kubernetes secret
   * @returns a custom secret object with the relevant attributes, the values of the data key:value pair
   *   objects must be base64 decoded
   */
  getSecret(
    namespace: string,
    labelSelector: string,
  ): Promise<{
    data: Record<string, string>;
    name: string;
    namespace: string;
    type: string;
    labels: Record<string, string>;
  }>;

  /**
   * creates a new Kubernetes secret with the provided attributes
   * @param name - the name of the new secret
   * @param namespace - the namespace to store the secret
   * @param secretType - the secret type
   * @param data - the secret, any values of a key:value pair must be base64 encoded
   * @param labels - the label to use for future label selector queries
   * @param recreate - if we should first run delete in the case that there the secret exists from a previous install
   * @returns whether the secret was created successfully
   */
  createSecret(
    name: string,
    namespace: string,
    secretType: string,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
    recreate: boolean,
  ): Promise<boolean>;

  /**
   * Delete a secret from the namespace
   * @param name - the name of the existing secret
   * @param namespace - the namespace to store the secret
   * @returns whether the secret was deleted successfully
   */
  deleteSecret(name: string, namespace: string): Promise<boolean>;

  /**
   * @param name - name of the configmap
   * @returns the configmap if found
   * @throws SoloError - if the response if not found or the response is not OK
   */
  getNamespacedConfigMap(name: string): Promise<k8s.V1ConfigMap>;

  /**
   * @param name - for the config name
   * @param labels - for the config metadata
   * @param data - to contain in the config
   */
  createNamespacedConfigMap(
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>;

  /**
   * @param name - for the config name
   * @param labels - for the config metadata
   * @param data - to contain in the config
   */
  replaceNamespacedConfigMap(
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>;

  deleteNamespacedConfigMap(name: string, namespace: string): Promise<boolean>;

  createNamespacedLease(
    namespace: string,
    leaseName: string,
    holderName: string,
    durationSeconds,
  ): Promise<k8s.V1Lease>;

  readNamespacedLease(leaseName: string, namespace: string, timesCalled?): Promise<any>;

  renewNamespaceLease(leaseName: string, namespace: string, lease: k8s.V1Lease): Promise<k8s.V1Lease>;

  transferNamespaceLease(lease: k8s.V1Lease, newHolderName: string): Promise<V1Lease>;

  deleteNamespacedLease(name: string, namespace: string): Promise<k8s.V1Status>;

  /**
   * Check if cert-manager is installed inside any namespace.
   * @returns if cert-manager is found
   */
  isCertManagerInstalled(): Promise<boolean>;

  /**
   * Check if minio is installed inside the namespace.
   * @returns if minio is found
   */
  isMinioInstalled(namespace: Namespace): Promise<boolean>;

  /**
   * Check if the ingress controller is installed inside any namespace.
   * @returns if ingress controller is found
   */
  isIngressControllerInstalled(): Promise<boolean>;

  isRemoteConfigPresentInAnyNamespace(): Promise<boolean>;

  isPrometheusInstalled(namespace: Namespace): Promise<boolean>;

  /**
   * Get a pod by name and namespace, will check every 1 second until the pod is no longer found.
   * Can throw a SoloError if there is an error while deleting the pod.
   * @param podName - the name of the pod
   * @param namespace - the namespace of the pod
   */
  killPod(podName: string, namespace: string): Promise<void>;

  /**
   * Download logs files from all network pods and save to local solo log directory
   * @param namespace - the namespace of the network
   * @returns a promise that resolves when the logs are downloaded
   */
  getNodeLogs(namespace: string): Promise<Awaited<unknown>[]>;

  /**
   * Download state files from a pod
   * @param namespace - the namespace of the network
   * @param nodeAlias - the pod name
   * @returns a promise that resolves when the state files are downloaded
   */
  getNodeStatesFromPod(namespace: string, nodeAlias: string): Promise<Awaited<unknown>[]>;

  setCurrentContext(context: string): void;

  getCurrentContext(): string;

  getCurrentContextNamespace(): Namespace;

  getCurrentClusterName(): string;
}
