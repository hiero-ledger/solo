// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import yaml from 'yaml';
import {HelmChartValues, type HelmChartValue} from '../../integration/helm/model/values.js';

export type HelmValuesObject = Record<string, unknown>;
export type HelmMapValue = Record<string, HelmChartValue>;
export type HelmToleration = Record<string, HelmChartValue>;

export function buildSchedulingChartValues(
  sourceChartValues: HelmChartValues,
  targetPath: string,
  sourcePath?: string,
): HelmChartValues {
  const nodeSelector: HelmMapValue = {};
  const tolerations: HelmToleration[] = [];

  for (const values of readHelmValuesObjects(sourceChartValues)) {
    mergeSchedulingValues(nodeSelector, tolerations, values, sourcePath);
  }

  return toChartValues(targetPath, nodeSelector, tolerations);
}

export function readHelmValuesObjects(chartValues: HelmChartValues): HelmValuesObject[] {
  return getValuesFilePaths(chartValues)
    .map((valuesFilePath: string): unknown => yaml.parse(fs.readFileSync(valuesFilePath, 'utf8')))
    .filter(isHelmValuesObject);
}

export function getValuesFilePaths(chartValues: HelmChartValues): string[] {
  const arguments_: string[] = chartValues.toArguments();
  const valuesFilePaths: string[] = [];

  for (let index: number = 0; index < arguments_.length - 1; index++) {
    if (arguments_[index] === '--values') {
      valuesFilePaths.push(arguments_[index + 1]);
    }
  }

  return valuesFilePaths;
}

export function mergeSchedulingValues(
  nodeSelector: HelmMapValue,
  tolerations: HelmToleration[],
  values: HelmValuesObject,
  sourcePath?: string,
): void {
  Object.assign(nodeSelector, getMapValue(values, 'nodeSelector'));
  addTolerations(tolerations, getTolerations(values, 'tolerations'));

  if (sourcePath) {
    Object.assign(nodeSelector, getMapValue(values, `${sourcePath}.nodeSelector`));
    addTolerations(tolerations, getTolerations(values, `${sourcePath}.tolerations`));
  }
}

export function getMapValue(values: HelmValuesObject, path: string): HelmMapValue {
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

export function getTolerations(values: HelmValuesObject, path: string): HelmToleration[] {
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

export function getValueAtPath(values: HelmValuesObject, path: string): unknown {
  let currentValue: unknown = values;

  for (const segment of path.split('.')) {
    if (!isHelmValuesObject(currentValue)) {
      return undefined;
    }

    currentValue = currentValue[segment];
  }

  return currentValue;
}

export function addTolerations(target: HelmToleration[], tolerations: HelmToleration[]): void {
  const existing: Set<string> = new Set(target.map((toleration: HelmToleration): string => JSON.stringify(toleration)));

  for (const toleration of tolerations) {
    const serialized: string = JSON.stringify(toleration);
    if (!existing.has(serialized)) {
      target.push(toleration);
      existing.add(serialized);
    }
  }
}

function toChartValues(targetPath: string, nodeSelector: HelmMapValue, tolerations: HelmToleration[]): HelmChartValues {
  const chartValues: HelmChartValues = new HelmChartValues();

  addNodeSelectorChartValues(chartValues, `${targetPath}.nodeSelector`, nodeSelector);
  addTolerationChartValues(chartValues, `${targetPath}.tolerations`, tolerations);

  return chartValues;
}

export function addNodeSelectorChartValues(
  chartValues: HelmChartValues,
  path: string,
  nodeSelector: HelmMapValue,
): void {
  for (const [key, value] of Object.entries(nodeSelector)) {
    chartValues.setString(`${path}.${escapeHelmPathSegment(key)}`, value);
  }
}

export function addTolerationChartValues(
  chartValues: HelmChartValues,
  path: string,
  tolerations: HelmToleration[],
): void {
  for (const [index, toleration] of tolerations.entries()) {
    for (const [key, value] of Object.entries(toleration)) {
      chartValues.setLiteral(`${path}[${index}].${key}`, value);
    }
  }
}

export function escapeHelmPathSegment(segment: string): string {
  return segment.replaceAll('.', String.raw`\.`);
}

export function isHelmValuesObject(value: unknown): value is HelmValuesObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isHelmChartValue(value: unknown): value is HelmChartValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
