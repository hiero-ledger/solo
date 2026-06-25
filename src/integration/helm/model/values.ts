// SPDX-License-Identifier: Apache-2.0

import {PathEx} from '../../../business/utils/path-ex.js';

export type HelmChartValue = string | number | boolean;

export class HelmChartValues {
  private readonly _arguments: string[] = [];

  public set(name: string, value: HelmChartValue): this {
    this._arguments.push('--set', `${name}=${value}`);
    return this;
  }

  public setLiteral(name: string, value: HelmChartValue): this {
    this._arguments.push('--set-literal', `${name}=${value}`);
    return this;
  }

  public setString(name: string, value: HelmChartValue): this {
    this._arguments.push('--set-string', `${name}=${value}`);
    return this;
  }

  public setFile(name: string, path: string): this {
    this._arguments.push('--set-file', `${name}=${path}`);
    return this;
  }

  public file(path: string): this {
    this._arguments.push('--values', path);
    return this;
  }

  public add(values: HelmChartValues): this {
    this._arguments.push(...values.toArguments());
    return this;
  }

  public arguments(...arguments_: string[]): this {
    this._arguments.push(...arguments_);
    return this;
  }

  public toArguments(): string[] {
    return [...this._arguments];
  }

  public isEmpty(): boolean {
    return this._arguments.length === 0;
  }

  public setMany(values: Record<string, HelmChartValue>): this {
    for (const [name, value] of Object.entries(values)) {
      this.set(name, value);
    }

    return this;
  }

  public clone(): HelmChartValues {
    return new HelmChartValues().arguments(...this._arguments);
  }

  public filesFromCommaSeparatedInput(input?: string): this {
    if (!input) {
      return this;
    }

    for (const path of input.split(',')) {
      const trimmedPath: string = path.trim();

      if (trimmedPath) {
        this.file(PathEx.resolve(trimmedPath));
      }
    }

    return this;
  }
}
