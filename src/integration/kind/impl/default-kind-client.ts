// SPDX-License-Identifier: Apache-2.0

import {type KindClient} from '../kind-client.js';
import {SemVer} from 'semver';
import {GetClustersRequest} from '../request/get/get-clusters-request.js';
import {KindCluster} from '../model/kind-cluster.js';
import {type KindRequest} from '../request/kind-request.js';
import {KindExecutionBuilder} from '../execution/kind-execution-builder.js';
import {type KindExecution} from '../execution/kind-execution.js';
import {VersionRequest} from '../request/version-request.js';
import {KindVersion} from '../model/kind-version.js';
import {ClusterCreateRequest} from '../request/cluster/cluster-create-request.js';
import {type ClusterCreateOptions} from '../model/create-cluster/cluster-create-options.js';
import {ClusterCreateOptionsBuilder} from '../model/create-cluster/create-cluster-options-builder.js';
import {ClusterCreateResponse} from '../model/create-cluster/cluster-create-response.js';
import {ClusterDeleteResponse} from '../model/delete-cluster/cluster-delete-response.js';
import {type ClusterDeleteOptions} from '../model/delete-cluster/cluster-delete-options.js';
import {ClusterDeleteOptionsBuilder} from '../model/delete-cluster/cluster-delete-options-builder.js';
import {ClusterDeleteRequest} from '../request/cluster/cluster-delete-request.js';
import {BuildNodeImagesResponse} from '../model/build-node-images/build-node-images-response.js';
import {type BuildNodeImagesOptions} from '../model/build-node-images/build-node-images-options.js';
import {BuildNodeImagesRequest} from '../request/build/build-node-images-request.js';
import {ExportLogsRequest} from '../request/export/export-logs-request.js';
import {type ExportLogsOptions} from '../model/export-logs/export-logs-options.js';
import {ExportLogsResponse} from '../model/export-logs/export-logs-response.js';
import {ExportLogsOptionsBuilder} from '../model/export-logs/export-logs-options-builder.js';
import {ExportKubeconfigOptionsBuilder} from '../model/export-kubeconfig/export-kubeconfig-options-builder.js';
import {type ExportKubeconfigOptions} from '../model/export-kubeconfig/export-kubeconfig-options.js';
import {ExportKubeconfigRequest} from '../request/export/export-kubeconfig-request.js';
import {ExportKubeconfigResponse} from '../model/export-kubeconfig/export-kubeconfig-response.js';
import {GetNodesResponse} from '../model/get-nodes/get-nodes-response.js';
import {type GetNodesOptions} from '../model/get-nodes/get-nodes-options.js';
import {GetNodesOptionsBuilder} from '../model/get-nodes/get-nodes-options-builder.js';
import {GetNodesRequest} from '../request/get/get-nodes-request.js';
import {GetKubeconfigOptionsBuilder} from '../model/get-kubeconfig/get-kubeconfig-options-builder.js';
import {type GetKubeconfigOptions} from '../model/get-kubeconfig/get-kubeconfig-options.js';
import {GetKubeconfigRequest} from '../request/get/get-kubeconfig-request.js';
import {GetKubeconfigResponse} from '../model/get-kubeconfig/get-kubeconfig-response.js';
import {type LoadDockerImageOptions} from '../model/load-docker-image/load-docker-image-options.js';
import {LoadDockerImageRequest} from '../request/load/docker-image-request.js';
import {LoadDockerImageResponse} from '../model/load-docker-image/load-docker-image-response.js';
import {LoadDockerImageOptionsBuilder} from '../model/load-docker-image/load-docker-image-options-builder.js';
import {type LoadImageArchiveOptions} from '../model/load-image-archive/load-image-archive-options.js';
import {LoadImageArchiveOptionsBuilder} from '../model/load-image-archive/load-image-archive-options-builder.js';
import {LoadImageArchiveResponse} from '../model/load-image-archive/load-image-archive-response.js';
import {LoadImageArchiveRequest} from '../request/load/image-archive-request.js';
import {KIND_VERSION} from '../../../../version.js';
import {KindVersionRequirementException} from '../errors/kind-version-requirement-exception.js';

type BiFunction<T, U, R> = (t: T, u: U) => R;

export class DefaultKindClient implements KindClient {
  private static minimumVersion: SemVer = new SemVer(KIND_VERSION);

  public constructor(private executable: string) {
    if (!executable || !executable.trim()) {
      throw new Error('executable must not be blank');
    }
    this.executable = executable;
  }

  public async checkVersion(): Promise<void> {
    const version: SemVer = await this.version();
    if (version.compare(DefaultKindClient.minimumVersion) < 0) {
      throw new KindVersionRequirementException(
        `The Kind CLI version ${version} is lower than the minimum required version ${DefaultKindClient.minimumVersion}.`,
      );
    }
  }

  public async version(): Promise<SemVer> {
    const request = new VersionRequest();
    const builder = new KindExecutionBuilder();
    builder.executable(this.executable);
    request.apply(builder);
    const execution = builder.build();
    if (execution instanceof Promise) {
      throw new TypeError('Unexpected async execution');
    }
    const versionClass = KindVersion as unknown as new () => KindVersion;
    const result = await execution.responseAs(versionClass);
    if (!(result instanceof KindVersion)) {
      throw new TypeError('Unexpected response type');
    }

    return result.getVersion();
  }

  public async createCluster(clusterName: string, options?: ClusterCreateOptions): Promise<ClusterCreateResponse> {
    const builder: ClusterCreateOptionsBuilder = ClusterCreateOptionsBuilder.from(options);
    builder.name(clusterName);
    return this.executeAsync(new ClusterCreateRequest(builder.build()), ClusterCreateResponse);
  }

  public async deleteCluster(clusterName?: string, options?: ClusterDeleteOptions): Promise<ClusterDeleteResponse> {
    const builder: ClusterDeleteOptionsBuilder = ClusterDeleteOptionsBuilder.from(options);
    builder.name(clusterName);
    return this.executeAsync(new ClusterDeleteRequest(builder.build()), ClusterDeleteResponse);
  }

  public async buildNodeImage(options?: BuildNodeImagesOptions): Promise<BuildNodeImagesResponse> {
    return this.executeAsync(new BuildNodeImagesRequest(options), BuildNodeImagesResponse);
  }

  public async exportLogs(clusterName?: string): Promise<ExportLogsResponse> {
    const options: ExportLogsOptions = ExportLogsOptionsBuilder.builder().name(clusterName).build();
    return this.executeAsync(new ExportLogsRequest(options), ExportLogsResponse);
  }

  public async exportKubeconfig(clusterName?: string): Promise<ExportKubeconfigResponse> {
    const options: ExportKubeconfigOptions = ExportKubeconfigOptionsBuilder.builder().name(clusterName).build();
    return this.executeAsync(new ExportKubeconfigRequest(options), ExportKubeconfigResponse);
  }

  public async getClusters(): Promise<KindCluster[]> {
    return this.executeAsList(new GetClustersRequest(), KindCluster);
  }

  public async getNodes(contextName?: string, options?: GetNodesOptions): Promise<GetNodesResponse> {
    const builder: GetNodesOptionsBuilder = GetNodesOptionsBuilder.from(options).name(contextName);
    return this.executeAsync(new GetNodesRequest(builder.build()), GetNodesResponse);
  }

  public async getKubeconfig(contextName?: string, options?: GetKubeconfigOptions): Promise<GetKubeconfigResponse> {
    const builder: GetKubeconfigOptionsBuilder = GetKubeconfigOptionsBuilder.from(options).name(contextName);
    return this.executeAsync(new GetKubeconfigRequest(builder.build()), GetKubeconfigResponse);
  }

  public async loadDockerImage(imageName: string, options?: LoadDockerImageOptions): Promise<LoadDockerImageResponse> {
    const builder: LoadDockerImageOptionsBuilder = LoadDockerImageOptionsBuilder.from(options).imageName(imageName);
    return this.executeAsync(new LoadDockerImageRequest(builder.build()), LoadDockerImageResponse);
  }

  public async loadImageArchive(
    imageName: string,
    options?: LoadImageArchiveOptions,
  ): Promise<LoadImageArchiveResponse> {
    const builder: LoadImageArchiveOptionsBuilder = LoadImageArchiveOptionsBuilder.from(options).name(imageName);
    return this.executeAsync(new LoadImageArchiveRequest(builder.build()), LoadImageArchiveResponse);
  }

  /**
   * Executes the given request and returns the response as the given class.
   * The request is executed using the default namespace.
   *
   * @param request - The request to execute
   * @param responseClass - The class of the response
   * @returns The response
   */
  private async executeAsync<T extends KindRequest, R>(
    request: T,
    responseClass?: new (...arguments_: any[]) => R,
  ): Promise<R> {
    return this.executeInternal(undefined, request, responseClass, async b => {
      const response = await b.responseAs(responseClass);
      return response as R;
    });
  }

  /**
   * Executes the given request and returns the response as a list of the given class.
   * The request is executed using the default namespace.
   *
   * @param request - The request to execute
   * @param responseClass - The class of the response
   * @returns A list of response objects
   */
  private async executeAsList<T extends KindRequest, R>(
    request: T,
    responseClass: new (...arguments_: any[]) => R,
  ): Promise<R[]> {
    return this.executeInternal(undefined, request, responseClass, async b => {
      const response = await b.responseAsList(responseClass);
      return response as R[];
    });
  }

  private async executeInternal<T extends KindRequest, R, V>(
    namespace: string | undefined,
    request: T,
    responseClass: new (...arguments_: any[]) => R,
    responseFunction: BiFunction<KindExecution, typeof responseClass, Promise<V>>,
  ): Promise<V> {
    if (namespace && !namespace.trim()) {
      throw new Error('namespace must not be blank');
    }

    const builder = new KindExecutionBuilder();
    builder.executable(this.executable);
    request.apply(builder);
    const execution = builder.build();
    return responseFunction(execution, responseClass);
  }
}
