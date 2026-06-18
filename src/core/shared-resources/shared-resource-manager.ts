// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {inject, injectable} from 'tsyringe-neo';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {type ChartManager} from '../chart-manager.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import * as constants from '../../core/constants.js';
import {HelmChartValues, type HelmChartValue} from '../../integration/helm/model/values.js';
import {
  addSchedulingValues,
  collectSchedulingValues,
  type HelmSchedulingValues,
} from '../util/helm-scheduling-values.js';

const ROLE_SCHEDULING_KEY: string = 'solo.hashgraph.io/role';
const POSTGRES_SCHEDULING_SOURCE_PATHS: string[] = ['postgresql.postgresql', 'postgresql.primary'];
const REDIS_SCHEDULING_SOURCE_PATHS: string[] = ['redis', 'redis.master', 'redis.replica'];
const REDIS_SCHEDULING_TARGET_PATHS: string[] = ['redis.master', 'redis.replica'];
const REDIS_ROLE_FALLBACK_PATHS: string[] = [
  'postgresql.postgresql',
  'postgresql.primary',
  'importer',
  'grpc',
  'rest',
  'restjava',
  'web3',
  'monitor',
];

@injectable()
export class SharedResourceManager {
  private postgresEnabled: boolean = false;
  private redisEnabled: boolean = false;
  private additionalChartValues: HelmChartValues = new HelmChartValues();

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.Helm) protected readonly helm?: HelmClient,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
  }

  public setAdditionalChartValues(additionalChartValues: HelmChartValues): void {
    this.additionalChartValues = additionalChartValues.clone();
  }

  public setSchedulingChartValues(sourceChartValues: HelmChartValues): void {
    this.additionalChartValues.add(buildSchedulingChartValues(sourceChartValues));
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
    valuesArgumentsMap?: Record<string, HelmChartValue>,
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

    const chartValues: HelmChartValues = new HelmChartValues()
      .setMany({
        ...valuesArgumentsMap,
        'postgresql.enabled': this.postgresEnabled,
        'redis.enabled': this.redisEnabled,
      })
      .add(this.additionalChartValues);

    this.additionalChartValues = new HelmChartValues();

    await this.chartManager.install(
      namespace,
      constants.SOLO_SHARED_RESOURCES_CHART,
      constants.SOLO_SHARED_RESOURCES_CHART,
      chartDirectory || constants.SOLO_TESTING_CHART_URL,
      soloChartVersion,
      chartValues,
      context,
    );

    return true;
  }
}

function buildSchedulingChartValues(sourceChartValues: HelmChartValues): HelmChartValues {
  const chartValues: HelmChartValues = new HelmChartValues();
  const postgresSchedulingValues: HelmSchedulingValues = collectSchedulingValues(
    sourceChartValues,
    POSTGRES_SCHEDULING_SOURCE_PATHS,
  );
  const redisSchedulingValues: HelmSchedulingValues = collectSchedulingValues(
    sourceChartValues,
    REDIS_SCHEDULING_SOURCE_PATHS,
  );

  addMissingRedisRoleScheduling(redisSchedulingValues, sourceChartValues);
  addSchedulingValues(chartValues, 'postgresql.primary', postgresSchedulingValues);

  for (const redisPath of REDIS_SCHEDULING_TARGET_PATHS) {
    addSchedulingValues(chartValues, redisPath, redisSchedulingValues);
  }

  return chartValues;
}

function addMissingRedisRoleScheduling(target: HelmSchedulingValues, sourceChartValues: HelmChartValues): void {
  for (const path of REDIS_ROLE_FALLBACK_PATHS) {
    const fallbackSchedulingValues: HelmSchedulingValues = collectSchedulingValues(sourceChartValues, [path], false);

    if (target.nodeSelector[ROLE_SCHEDULING_KEY] === undefined) {
      const role: HelmChartValue | undefined = fallbackSchedulingValues.nodeSelector[ROLE_SCHEDULING_KEY];
      if (role !== undefined) {
        target.nodeSelector[ROLE_SCHEDULING_KEY] = role;
      }
    }

    if (!hasTolerationForKey(target.tolerations, ROLE_SCHEDULING_KEY)) {
      const toleration: Record<string, HelmChartValue> | undefined = fallbackSchedulingValues.tolerations.find(
        (candidate: Record<string, HelmChartValue>): boolean => candidate.key === ROLE_SCHEDULING_KEY,
      );
      if (toleration) {
        target.tolerations.push(toleration);
      }
    }

    if (
      target.nodeSelector[ROLE_SCHEDULING_KEY] !== undefined &&
      hasTolerationForKey(target.tolerations, ROLE_SCHEDULING_KEY)
    ) {
      return;
    }
  }
}

function hasTolerationForKey(tolerations: Record<string, HelmChartValue>[], key: string): boolean {
  return tolerations.some((toleration: Record<string, HelmChartValue>): boolean => toleration.key === key);
}
