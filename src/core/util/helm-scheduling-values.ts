// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import yaml from 'yaml';
import {HelmChartValues, type HelmChartValue} from '../../integration/helm/model/values.js';

type HelmValuesObject = Record<string, unknown>;
type HelmMapValue = HelmSchedulingValues['nodeSelector'];
type HelmToleration = HelmSchedulingValues['tolerations'][number];

export interface HelmSchedulingValues {
  nodeSelector: Record<string, HelmChartValue>;
  tolerations: Record<string, HelmChartValue>[];
}

export function buildSchedulingChartValues(
  sourceChartValues: HelmChartValues,
  targetPath: string,
  sourcePath?: string,
): HelmChartValues {
  const schedulingValues: HelmSchedulingValues = collectSchedulingValues(
    sourceChartValues,
    sourcePath === undefined ? [] : [sourcePath],
  );

  return toChartValues(targetPath, schedulingValues);
}

export function collectSchedulingValues(
  sourceChartValues: HelmChartValues,
  sourcePaths: string[] = [],
  includeTopLevel: boolean = true,
): HelmSchedulingValues {
  const schedulingValues: HelmSchedulingValues = createSchedulingValues();

  for (const values of readHelmValuesObjects(sourceChartValues)) {
    mergeSchedulingValues(schedulingValues, values, sourcePaths, includeTopLevel);
  }

  return schedulingValues;
}

function createSchedulingValues(): HelmSchedulingValues {
  return {
    nodeSelector: {},
    tolerations: [],
  };
}

function readHelmValuesObjects(chartValues: HelmChartValues): HelmValuesObject[] {
  return getValuesFilePaths(chartValues)
    .map((valuesFilePath: string): unknown => yaml.parse(fs.readFileSync(valuesFilePath, 'utf8')))
    .filter(isHelmValuesObject);
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

function mergeSchedulingValues(
  target: HelmSchedulingValues,
  values: HelmValuesObject,
  sourcePaths: string[],
  includeTopLevel: boolean,
): void {
  if (includeTopLevel) {
    mergeSchedulingValuesFromPath(target, values, '');
  }

  for (const sourcePath of sourcePaths) {
    mergeSchedulingValuesFromPath(target, values, sourcePath);
  }
}

function mergeSchedulingValuesFromPath(
  target: HelmSchedulingValues,
  values: HelmValuesObject,
  sourcePath: string,
): void {
  const pathPrefix: string = sourcePath === '' ? '' : `${sourcePath}.`;

  Object.assign(target.nodeSelector, getMapValue(values, `${pathPrefix}nodeSelector`));
  addTolerations(target.tolerations, getTolerations(values, `${pathPrefix}tolerations`));
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

function toChartValues(targetPath: string, schedulingValues: HelmSchedulingValues): HelmChartValues {
  const chartValues: HelmChartValues = new HelmChartValues();

  addSchedulingValues(chartValues, targetPath, schedulingValues);

  return chartValues;
}

export function addSchedulingValues(
  chartValues: HelmChartValues,
  targetPath: string,
  schedulingValues: HelmSchedulingValues,
): void {
  const nodeSelectorPath: string = `${targetPath}.nodeSelector`;
  const tolerationsPath: string = `${targetPath}.tolerations`;

  for (const [key, value] of Object.entries(schedulingValues.nodeSelector)) {
    chartValues.setString(`${nodeSelectorPath}.${escapeHelmPathSegment(key)}`, value);
  }

  for (const [index, toleration] of schedulingValues.tolerations.entries()) {
    for (const [key, value] of Object.entries(toleration)) {
      chartValues.setLiteral(`${tolerationsPath}[${index}].${key}`, value);
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
