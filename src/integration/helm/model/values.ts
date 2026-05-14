// SPDX-License-Identifier: Apache-2.0

export type HelmChartValue = string | number | boolean;

export class HelmChartValues {
  public readonly setValues: string[] = [];
  public readonly setLiteralValues: string[] = [];
  public readonly setFileValues: string[] = [];
  public readonly valueFiles: string[] = [];

  public set(name: string, value: HelmChartValue): this {
    this.setValues.push(`${name}=${value}`);
    return this;
  }

  public setLiteral(name: string, value: HelmChartValue): this {
    this.setLiteralValues.push(`${name}=${value}`);
    return this;
  }

  public setFile(name: string, path: string): this {
    this.setFileValues.push(`${name}=${path}`);
    return this;
  }

  public setMany(values: Record<string, HelmChartValue>): this {
    for (const [name, value] of Object.entries(values)) {
      this.set(name, value);
    }

    return this;
  }

  public file(path: string): this {
    this.valueFiles.push(path);
    return this;
  }

  public add(values: HelmChartValues): this {
    this.setValues.push(...values.setValues);
    this.setLiteralValues.push(...values.setLiteralValues);
    this.setFileValues.push(...values.setFileValues);
    this.valueFiles.push(...values.valueFiles);
    return this;
  }
}
