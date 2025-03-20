// SPDX-License-Identifier: Apache-2.0

// Define BiFunction type for TypeScript
import {type UnInstallChartOptions} from '../model/install/UnInstallChartOptions.js';

type BiFunction<T, U, R> = (t: T, u: U) => R;

import {type HelmClient} from '../HelmClient.js';
import {type HelmExecution} from '../execution/HelmExecution.js';
import {HelmExecutionBuilder} from '../execution/HelmExecutionBuilder.js';
import {type Chart} from '../model/Chart.js';
import {Repository} from '../model/Repository.js';
import {Version} from '../model/Version.js';
import {Release} from '../model/chart/Release.js';
import {type InstallChartOptions} from '../model/install/InstallChartOptions.js';
import {type UpgradeChartOptions} from '../model/upgrade/UpgradeChartOptions.js';
import {ReleaseItem} from '../model/release/ReleaseItem.js';
import {type TestChartOptions} from '../model/test/TestChartOptions.js';
import {type HelmRequest} from '../request/HelmRequest.js';
import {ChartDependencyUpdateRequest} from '../request/chart/ChartDependencyUpdateRequest.js';
import {ChartInstallRequest} from '../request/chart/ChartInstallRequest.js';
import {ChartTestRequest} from '../request/chart/ChartTestRequest.js';
import {ChartUninstallRequest} from '../request/chart/ChartUninstallRequest.js';
import {ChartUpgradeRequest} from '../request/chart/ChartUpgradeRequest.js';
import {VersionRequest} from '../request/common/VersionRequest.js';
import {ReleaseListRequest} from '../request/release/ReleaseListRequest.js';
import {RepositoryAddRequest} from '../request/repository/RepositoryAddRequest.js';
import {RepositoryListRequest} from '../request/repository/RepositoryListRequest.js';
import {RepositoryRemoveRequest} from '../request/repository/RepositoryRemoveRequest.js';
import {type SemanticVersion} from '../base/api/version/SemanticVersion.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../logging.js';
import {patchInject} from '../../dependency-injection/container-helper.js';

@injectable()
/**
 * The default implementation of the HelmClient interface.
 */
export class DefaultHelmClient implements HelmClient {
  /**
   * The name of the namespace argument.
   */
  private static readonly NAMESPACE_ARG_NAME = 'namespace';

  constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public async version(): Promise<SemanticVersion> {
    const request = new VersionRequest();
    const builder = new HelmExecutionBuilder();
    this.applyBuilderDefaults(builder);
    request.apply(builder);
    const execution = builder.build();
    if (execution instanceof Promise) {
      throw new Error('Unexpected async execution');
    }
    const versionClass = Version as unknown as new () => Version;
    const result = await execution.responseAs(versionClass);
    if (!(result instanceof Version)) {
      throw new Error('Unexpected response type');
    }
    return result.asSemanticVersion();
  }

  public async listRepositories(): Promise<Repository[]> {
    return this.executeAsList(new RepositoryListRequest(), Repository);
  }

  public async addRepository(repository: Repository): Promise<void> {
    await this.executeAsync(new RepositoryAddRequest(repository), undefined);
  }

  public async removeRepository(repository: Repository): Promise<void> {
    await this.executeAsync(new RepositoryRemoveRequest(repository), undefined);
  }

  public async installChart(releaseName: string, chart: Chart, options: InstallChartOptions): Promise<Release> {
    const release = Release as unknown as new () => Release;
    const request = new ChartInstallRequest(releaseName, chart, options);
    return this.executeInternal(options.namespace, request, release, async execution => {
      const response = await execution.responseAs(release);
      return response as Release;
    });
  }

  public async uninstallChart(releaseName: string, options: UnInstallChartOptions): Promise<void> {
    await this.executeAsync(new ChartUninstallRequest(releaseName, options), undefined);
  }

  public async testChart(releaseName: string, options: TestChartOptions): Promise<void> {
    await this.executeAsync(new ChartTestRequest(releaseName, options), undefined);
  }

  public async listReleases(allNamespaces: boolean, namespace?: string): Promise<ReleaseItem[]> {
    return this.executeAsList(new ReleaseListRequest(allNamespaces, namespace), ReleaseItem);
  }

  public async dependencyUpdate(chartName: string): Promise<void> {
    await this.executeAsync(new ChartDependencyUpdateRequest(chartName), undefined);
  }

  public async upgradeChart(releaseName: string, chart: Chart, options: UpgradeChartOptions): Promise<Release> {
    const request = new ChartUpgradeRequest(releaseName, chart, options);
    return this.executeInternal(options.namespace, request, Release, async (execution: HelmExecution) =>
      execution.responseAs(Release),
    );
  }

  /**
   * Applies the default namespace and authentication configuration to the given builder.
   * @param builder - The builder to apply to which the defaults should be applied
   */
  private applyBuilderDefaults(builder: HelmExecutionBuilder): void {}

  /**
   * Executes the given request and returns the response as the given class.
   * The request is executed using the default namespace.
   *
   * @param request - The request to execute
   * @param responseClass - The class of the response
   * @returns The response
   */
  private async executeAsync<T extends HelmRequest, R>(
    request: T,
    responseClass: new (...args: any[]) => R,
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
  private async executeAsList<T extends HelmRequest, R>(
    request: T,
    responseClass: new (...args: any[]) => R,
  ): Promise<R[]> {
    return this.executeInternal(undefined, request, responseClass, async b => {
      const response = await b.responseAsList(responseClass);
      return response as R[];
    });
  }

  private async executeInternal<T extends HelmRequest, R, V>(
    namespace: string | undefined,
    request: T,
    responseClass: new (...args: any[]) => R,
    responseFn: BiFunction<HelmExecution, typeof responseClass, Promise<V>>,
  ): Promise<V> {
    if (namespace && !namespace.trim()) {
      throw new Error('namespace must not be blank');
    }

    const builder = new HelmExecutionBuilder();
    this.applyBuilderDefaults(builder);
    request.apply(builder);
    if (namespace) {
      builder.argument(DefaultHelmClient.NAMESPACE_ARG_NAME, namespace);
    }
    const execution = builder.build();
    return responseFn(execution, responseClass);
  }
}
