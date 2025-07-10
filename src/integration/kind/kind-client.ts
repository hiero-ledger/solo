// SPDX-License-Identifier: Apache-2.0

import {type SemVer} from 'semver';
import {type KindCluster} from './model/kind-cluster.js';
import {type ClusterCreateResponse} from './model/create-cluster/cluster-create-response.js';
import {type ClusterDeleteResponse} from './model/delete-cluster/cluster-delete-response.js';
import {type ClusterDeleteOptions} from './model/delete-cluster/cluster-delete-options.js';
import {type ClusterCreateOptions} from './model/create-cluster/cluster-create-options.js';
import {type BuildNodeImagesResponse} from './model/build-node-images/build-node-images-response.js';
import {type BuildNodeImagesOptions} from './model/build-node-images/build-node-images-options.js';
import {type ExportLogsResponse} from './model/export-logs/export-logs-response.js';

/**
 * The KindClient is a bridge between TypeScript and the Kind CLI.
 */
export interface KindClient {
  /**
   * Executes the Kind CLI version sub-command and returns the reported version.
   *
   * @returns the version of the Kind CLI that is being used by this client.
   */
  version(): Promise<SemVer>;

  /**
   * Executes the Kind CLI cluster create sub-command.
   *
   * @param clusterName the name of the cluster to create. If not provided, a default name will be used.
   * @param options the options to use for creating the cluster. If not provided, default options will be used.
   * @returns the response of the create operation, which includes the name of the created cluster and other details.
   */
  createCluster(clusterName?: string, options?: ClusterCreateOptions): Promise<ClusterCreateResponse>;

  /**
   * Executes the Kind CLI cluster delete sub-command and returns the result.
   *
   * @param clusterName the name of the cluster to delete. If not provided, the default cluster will be deleted.
   * @param options the options to use for deleting the cluster. If not provided, default options will be used.
   * @returns the response of the delete operation.
   */
  deleteCluster(clusterName?: string, options?: ClusterDeleteOptions): Promise<ClusterDeleteResponse>;

  /**
   * Build the node image
   *
   * @param options the options to use for building the node images.
   * @returns the list of clusters.
   */
  buildNodeImage(options?: BuildNodeImagesOptions): Promise<BuildNodeImagesResponse>;

  /**
   * Executes the Kind CLI cluster export sub-command and returns the logs of the cluster.
   *
   * @param clusterName the name of the cluster to export logs from. If not provided, the default cluster will be used.
   * @returns the logs of the cluster.
   */
  exportLogs(clusterName?: string): Promise<ExportLogsResponse>;

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
  getClusters(): Promise<KindCluster[]>;

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
