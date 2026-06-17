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
  addNodeSelectorChartValues,
  addTolerationChartValues,
  addTolerations,
  getMapValue,
  getTolerations,
  readHelmValuesObjects,
  type HelmMapValue,
  type HelmToleration,
  type HelmValuesObject,
} from '../util/helm-scheduling-values.js';

const ROLE_SCHEDULING_KEY: string = 'solo.hashgraph.io/role';
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

interface SharedResourceSchedulingValues {
  postgresNodeSelector: HelmMapValue;
  postgresTolerations: HelmToleration[];
  redisNodeSelector: HelmMapValue;
  redisTolerations: HelmToleration[];
}

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
  const schedulingValues: SharedResourceSchedulingValues = {
    postgresNodeSelector: {},
    postgresTolerations: [],
    redisNodeSelector: {},
    redisTolerations: [],
  };

  for (const values of readHelmValuesObjects(sourceChartValues)) {
    mergeSchedulingValues(schedulingValues, values);
  }

  return toChartValues(schedulingValues);
}

function mergeSchedulingValues(target: SharedResourceSchedulingValues, values: HelmValuesObject): void {
  const topLevelNodeSelector: HelmMapValue = getMapValue(values, 'nodeSelector');
  const topLevelTolerations: HelmToleration[] = getTolerations(values, 'tolerations');

  Object.assign(target.postgresNodeSelector, topLevelNodeSelector);
  addTolerations(target.postgresTolerations, topLevelTolerations);
  Object.assign(target.redisNodeSelector, topLevelNodeSelector);
  addTolerations(target.redisTolerations, topLevelTolerations);

  for (const path of ['postgresql.postgresql', 'postgresql.primary']) {
    Object.assign(target.postgresNodeSelector, getMapValue(values, `${path}.nodeSelector`));
    addTolerations(target.postgresTolerations, getTolerations(values, `${path}.tolerations`));
  }

  for (const path of ['redis', 'redis.master', 'redis.replica']) {
    Object.assign(target.redisNodeSelector, getMapValue(values, `${path}.nodeSelector`));
    addTolerations(target.redisTolerations, getTolerations(values, `${path}.tolerations`));
  }

  mergeRedisRoleScheduling(target, values);
}

function mergeRedisRoleScheduling(target: SharedResourceSchedulingValues, values: HelmValuesObject): void {
  if (target.redisNodeSelector[ROLE_SCHEDULING_KEY] === undefined) {
    const role: HelmChartValue | undefined = findRoleNodeSelector(values);
    if (role !== undefined) {
      target.redisNodeSelector[ROLE_SCHEDULING_KEY] = role;
    }
  }

  if (!hasTolerationForKey(target.redisTolerations, ROLE_SCHEDULING_KEY)) {
    const toleration: HelmToleration | undefined = findRoleToleration(values);
    if (toleration) {
      addTolerations(target.redisTolerations, [toleration]);
    }
  }
}

function findRoleNodeSelector(values: HelmValuesObject): HelmChartValue | undefined {
  for (const path of REDIS_ROLE_FALLBACK_PATHS) {
    const role: HelmChartValue | undefined = getMapValue(values, `${path}.nodeSelector`)[ROLE_SCHEDULING_KEY];
    if (role !== undefined) {
      return role;
    }
  }

  return undefined;
}

function findRoleToleration(values: HelmValuesObject): HelmToleration | undefined {
  for (const path of REDIS_ROLE_FALLBACK_PATHS) {
    const toleration: HelmToleration | undefined = getTolerations(values, `${path}.tolerations`).find(
      (candidate: HelmToleration): boolean => candidate.key === ROLE_SCHEDULING_KEY,
    );
    if (toleration) {
      return toleration;
    }
  }

  return undefined;
}

function hasTolerationForKey(tolerations: HelmToleration[], key: string): boolean {
  return tolerations.some((toleration: HelmToleration): boolean => toleration.key === key);
}

function toChartValues(schedulingValues: SharedResourceSchedulingValues): HelmChartValues {
  const chartValues: HelmChartValues = new HelmChartValues();

  addNodeSelectorChartValues(chartValues, 'postgresql.primary.nodeSelector', schedulingValues.postgresNodeSelector);
  addTolerationChartValues(chartValues, 'postgresql.primary.tolerations', schedulingValues.postgresTolerations);

  for (const redisPath of ['redis.master', 'redis.replica']) {
    addNodeSelectorChartValues(chartValues, `${redisPath}.nodeSelector`, schedulingValues.redisNodeSelector);
    addTolerationChartValues(chartValues, `${redisPath}.tolerations`, schedulingValues.redisTolerations);
  }

  return chartValues;
}
