// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {inject, injectable} from 'tsyringe-neo';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {type ChartManager} from '../chart-manager.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import * as constants from '../../core/constants.js';

@injectable()
export class SharedResourceManager {
  private postgresEnabled: boolean = false;
  private redisEnabled: boolean = false;
  private additionalValuesArgument: string = '';

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.Helm) protected readonly helm?: HelmClient,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
  }

  public setAdditionalValuesArgument(additionalArguments: string): void {
    this.additionalValuesArgument = additionalArguments;
  }

  public enablePostgres(): void {
    this.postgresEnabled = true;
  }

  public enableRedis(): void {
    this.redisEnabled = true;
  }

  public async uninstallChart(namespace: NamespaceName, context?: string): Promise<void> {
    const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      context,
    );

    if (!isChartInstalled) {
      this.logger?.info(
        `Shared resources chart is not installed in namespace ${namespace.name}, skipping uninstallation.`,
      );
      return;
    }

    await this.chartManager.uninstall(namespace, constants.SOLO_SHARED_RESOURCES_CHART, context);
  }

  /**
   *  Installs the shared resources chart in the specified namespace if it is not already installed.
   *  Returns true if the chart was installed, false if it was already installed.
   * @param namespace
   * @param chartDirectory
   * @param soloChartVersion
   * @param context
   * @param valuesArgumentsMap
   */
  public async installChart(
    namespace: NamespaceName,
    chartDirectory: string,
    soloChartVersion: string,
    context?: string,
    valuesArgumentsMap?: Record<string, string>,
  ): Promise<boolean> {
    const isChartInstalled: boolean = await this.chartManager.isChartInstalled(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      context,
    );

    if (isChartInstalled) {
      this.logger?.info(
        `Shared resources chart is already installed in namespace ${namespace.name}, skipping installation.`,
      );
      return false;
    }

    valuesArgumentsMap = {
      ...valuesArgumentsMap,
      'postgresql.enabled': this.postgresEnabled.toString(),
      'redis.enabled': this.redisEnabled.toString(),
    };

    const values: string = Object.entries(valuesArgumentsMap)
      .map(([key, value]): string => `--set ${key}=${value}`)
      .join(' ');

    const fullValues: string = this.additionalValuesArgument ? `${values} ${this.additionalValuesArgument}` : values;
    this.additionalValuesArgument = '';

    await this.chartManager.install(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      constants.SOLO_SHARED_RESOURCES_CHART,
      chartDirectory || constants.SOLO_TESTING_CHART_URL,
      soloChartVersion,
      fullValues,
      context,
    );

    return true;
  }
}
