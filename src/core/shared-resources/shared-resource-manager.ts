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
import * as fs from 'node:fs';
import yaml from 'yaml';

type HelmValuesObject = Record<string, unknown>;
type HelmMapValue = Record<string, HelmChartValue>;
type HelmToleration = HelmMapValue;

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

  for (const valuesFilePath of getValuesFilePaths(sourceChartValues)) {
    const values: unknown = yaml.parse(fs.readFileSync(valuesFilePath, 'utf8'));
    if (!isHelmValuesObject(values)) {
      continue;
    }

    mergeSchedulingValues(schedulingValues, values);
  }

  return toChartValues(schedulingValues);
}

function getValuesFilePaths(chartValues: HelmChartValues): string[] {
  const arguments_: string[] = chartValues.toArguments();
  const valuesFilePaths: string[] = [];

  for (let index: number = 0; index < arguments_.length - 1; index++) {
    if (arguments_[index] === '--values') {
      valuesFilePaths.push(arguments_[index + 1]);
    }
  }

  return valuesFilePaths;
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
}

function getMapValue(values: HelmValuesObject, path: string): HelmMapValue {
  const value: unknown = getValueAtPath(values, path);
  if (!isHelmValuesObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry: [string, unknown]): entry is [string, HelmChartValue] =>
      isHelmChartValue(entry[1]),
    ),
  );
}

function getTolerations(values: HelmValuesObject, path: string): HelmToleration[] {
  const value: unknown = getValueAtPath(values, path);
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isHelmValuesObject)
    .map(
      (toleration: HelmValuesObject): HelmToleration =>
        Object.fromEntries(
          Object.entries(toleration).filter((entry: [string, unknown]): entry is [string, HelmChartValue] =>
            isHelmChartValue(entry[1]),
          ),
        ),
    )
    .filter((toleration: HelmToleration): boolean => Object.keys(toleration).length > 0);
}

function getValueAtPath(values: HelmValuesObject, path: string): unknown {
  let currentValue: unknown = values;

  for (const segment of path.split('.')) {
    if (!isHelmValuesObject(currentValue)) {
      return undefined;
    }

    currentValue = currentValue[segment];
  }

  return currentValue;
}

function addTolerations(target: HelmToleration[], tolerations: HelmToleration[]): void {
  const existing: Set<string> = new Set(target.map((toleration: HelmToleration): string => JSON.stringify(toleration)));

  for (const toleration of tolerations) {
    const serialized: string = JSON.stringify(toleration);
    if (!existing.has(serialized)) {
      target.push(toleration);
      existing.add(serialized);
    }
  }
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

function addNodeSelectorChartValues(chartValues: HelmChartValues, path: string, nodeSelector: HelmMapValue): void {
  for (const [key, value] of Object.entries(nodeSelector)) {
    chartValues.setString(`${path}.${escapeHelmPathSegment(key)}`, value);
  }
}

function addTolerationChartValues(chartValues: HelmChartValues, path: string, tolerations: HelmToleration[]): void {
  for (const [index, toleration] of tolerations.entries()) {
    for (const [key, value] of Object.entries(toleration)) {
      chartValues.setLiteral(`${path}[${index}].${key}`, value);
    }
  }
}

function escapeHelmPathSegment(segment: string): string {
  return segment.replaceAll('.', String.raw`\.`);
}

function isHelmValuesObject(value: unknown): value is HelmValuesObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHelmChartValue(value: unknown): value is HelmChartValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
