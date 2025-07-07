// SPDX-License-Identifier: Apache-2.0

import {type SemanticVersion} from '../helm/base/api/version/semantic-version.js';

/**
 * The KindClient is a bridge between TypeScript and the Kind CLI.
 */
export interface KindClient {
  /**
   * Executes the Kind CLI version sub-command and returns the reported version.
   *
   * @returns the version of the Kind CLI that is being used by this client.
   */
  version(): Promise<SemanticVersion>;

  /**
   * Executes the Kind CLI cluster create sub-command.
   *
   * @param clusterName the name of the cluster to create. If not provided, a default name will be used.
   */
  createCluster(clusterName?: string): Promise<void>;

  /**
   * Executes the Kind CLI cluster delete sub-command and returns the result.
   *
   * @param clusterName the name of the cluster to delete. If not provided, the default cluster will be deleted.
   * @returns boolean.
   */
  deleteCluster(clusterName?: string): Promise<boolean>;

  /**
   * Executes the Kind CLI cluster list sub-command and returns the list of clusters.
   *
   * @param imageName the name of the image to use for the nodes. If not provided, the default Kind image will be used.
   * @returns the list of clusters.
   */
  buildNodeImage(imageName?: string): Promise<void>;

  /**
   * Executes the Kind CLI cluster export sub-command and returns the logs of the cluster.
   *
   * @param clusterName the name of the cluster to export logs from. If not provided, the default cluster will be used.
   * @returns the logs of the cluster.
   */
  exportLogs(clusterName?: string): Promise<string>;

  /**
   * Executes the Kind CLI kubeconfig export sub-command and returns the kubeconfig of the cluster.
   *
   * @param clusterName the name of the cluster to export the kubeconfig from. If not provided, the default cluster will be used.
   * @returns the kubeconfig of the cluster.
   */
  exportKubeconfig(clusterName?: string): Promise<string>;

  /**
   * Returns a list of clusters that are managed by Kind.
   *
   * @returns a list of cluster names.
   */
  getClusters(): Promise<string[]>;

  /**
   * Returns a list of nodes in the specified cluster.
   *
   * @param clusterName the name of the cluster to get nodes from. If not provided, the default cluster will be used.
   * @returns a list of node names.
   */
  getNodes(clusterName?: string): Promise<string[]>;

  /**
   * Returns the kubeconfig of the specified cluster.
   *
   * @param clusterName the name of the cluster to get the kubeconfig from. If not provided, the default cluster will be used.
   * @returns the kubeconfig of the cluster.
   */
  getKubeconfig(clusterName?: string): Promise<string>;

  /**
   * Loads the specified images into the Kind cluster.
   *
   * @param clusterName the name of the cluster to load images into.
   * @param imageNames the names of the images to load.
   */
  loadImages(clusterName: string, imageNames: string[]): Promise<void>;

  /**
   * Loads an image archive into the Kind cluster.
   *
   * @param clusterName the name of the cluster to load the image archive into.
   * @param archivePath the path to the image archive file.
   */
  loadImageArchive(clusterName: string, archivePath: string): Promise<void>;
}
