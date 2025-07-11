// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {type KindClient} from '../kind-client.js';
import {InjectTokens} from '../../../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../../../core/dependency-injection/container-helper.js';
import {SemVer} from 'semver';
import {GetClustersRequest} from '../request/get/get-clusters-request.js';
import {KindCluster} from '../model/kind-cluster.js';
import {KindRequest} from '../request/kind-request.js';
import {KindExecutionBuilder} from '../execution/kind-execution-builder.js';
import {KindExecution} from '../execution/kind-execution.js';
import {VersionRequest} from '../request/version-request.js';
import {KindVersion} from '../model/kind-version.js';
import {ClusterCreateRequest} from '../request/cluster/cluster-create-request.js';
import {ClusterCreateOptions} from '../model/create-cluster/cluster-create-options.js';
import {ClusterCreateOptionsBuilder} from '../model/create-cluster/create-cluster-options-builder.js';
import {ClusterCreateResponse} from '../model/create-cluster/cluster-create-response.js';
import {ClusterDeleteResponse} from '../model/delete-cluster/cluster-delete-response.js';
import {ClusterDeleteOptions} from '../model/delete-cluster/cluster-delete-options.js';
import {ClusterDeleteOptionsBuilder} from '../model/delete-cluster/cluster-delete-options-builder.js';
import {ClusterDeleteRequest} from '../request/cluster/cluster-delete-request.js';
import {BuildNodeImagesResponse} from '../model/build-node-images/build-node-images-response.js';
import {BuildNodeImagesOptions} from '../model/build-node-images/build-node-images-options.js';
import {BuildNodeImagesRequest} from '../request/build/build-node-images-request.js';
import {ExportLogsRequest} from '../request/export/export-logs-request.js';
import {ExportLogsOptions} from '../model/export-logs/export-logs-options.js';
import {ExportLogsResponse} from '../model/export-logs/export-logs-response.js';
import {ExportLogsOptionsBuilder} from '../model/export-logs/export-logs-options-builder.js';
import {ExportKubeconfigOptionsBuilder} from '../model/export-kubeconfig/export-kubeconfig-options-builder.js';
import {ExportKubeconfigOptions} from '../model/export-kubeconfig/export-kubeconfig-options.js';
import {ExportKubeconfigRequest} from '../request/export/export-kubeconfig-request.js';
import {ExportKubeconfigResponse} from '../model/export-kubeconfig/export-kubeconfig-response.js';
import {GetNodesResponse} from '../model/get-nodes/get-nodes-response.js';
import {GetNodesOptions} from '../model/get-nodes/get-nodes-options.js';
import {GetNodesOptionsBuilder} from '../model/get-nodes/get-nodes-options-builder.js';
import {GetNodesRequest} from '../request/get/get-nodes-request.js';
import {GetKubeconfigOptionsBuilder} from '../model/get-kubeconfig/get-kubeconfig-options-builder.js';
import {GetKubeconfigOptions} from '../model/get-kubeconfig/get-kubeconfig-options.js';
import {GetKubeconfigRequest} from '../request/get/get-kubeconfig-request.js';
import {GetKubeconfigResponse} from '../model/get-kubeconfig/get-kubeconfig-response.js';

type BiFunction<T, U, R> = (t: T, u: U) => R;

@injectable()
export class DefaultKindClient implements KindClient {
  constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: any) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public async version(): Promise<SemVer> {
    const request = new VersionRequest();
    const builder = new KindExecutionBuilder();
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

  public async loadImages(clusterName: string, imageNames: string[]): Promise<void> {
    // @ts-ignore
    return;
  }

  public async loadImageArchive(clusterName: string, archivePath: string): Promise<void> {
    // @ts-ignore
    return;
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
    request.apply(builder);
    const execution = builder.build();
    return responseFunction(execution, responseClass);
  }
}
