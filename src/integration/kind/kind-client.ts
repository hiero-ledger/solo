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
import {type ExportKubeconfigResponse} from './model/export-kubeconfig/export-kubeconfig-response.js';
import {type GetNodesOptions} from './model/get-nodes/get-nodes-options.js';
import {type GetNodesResponse} from './model/get-nodes/get-nodes-response.js';
import {type GetKubeconfigOptions} from './model/get-kubeconfig/get-kubeconfig-options.js';
import {type GetKubeconfigResponse} from './model/get-kubeconfig/get-kubeconfig-response.js';
import {type LoadDockerImageOptions} from './model/load-docker-image/load-docker-image-options.js';
import {type LoadDockerImageResponse} from './model/load-docker-image/load-docker-image-response.js';
import {type LoadImageArchiveOptions} from './model/load-image-archive/load-image-archive-options.js';
import {type LoadImageArchiveResponse} from './model/load-image-archive/load-image-archive-response.js';

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
  exportKubeconfig(clusterName?: string): Promise<ExportKubeconfigResponse>;

  /**
   * Returns a list of clusters that are managed by Kind.
   *
   * @returns a list of cluster names.
   */
  getClusters(): Promise<KindCluster[]>;

  /**
   * Returns a list of nodes in the specified cluster.
   *
   * @param contextName the name of the cluster context to get nodes from.
   * @param options the options to use for getting nodes.
   * @returns a list of node names.
   */
  getNodes(contextName?: string, options?: GetNodesOptions): Promise<GetNodesResponse>;

  /**
   * Returns the kubeconfig of the specified cluster.
   *
   * @param contextName the name of the cluster context to get the kubeconfig from.
   * @param options the options to use for getting the kubeconfig.
   * @returns the kubeconfig of the cluster.
   */
  getKubeconfig(contextName?: string, options?: GetKubeconfigOptions): Promise<GetKubeconfigResponse>;

  /**
   * Loads the specified images into the Kind cluster.
   *
   * @param imageName the names of the images to load.
   * @param options the options to use for loading the images
   */
  loadDockerImage(imageName: string, options?: LoadDockerImageOptions): Promise<LoadDockerImageResponse>;

  /**
   * Loads an image archive into the Kind cluster.
   *
   * @param imageName the name of the images to load from the archive.
   * @param options the options to use for loading the image archive
   */
  loadImageArchive(imageName: string, options?: LoadImageArchiveOptions): Promise<LoadImageArchiveResponse>;
}
