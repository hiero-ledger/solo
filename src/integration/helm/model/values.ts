// SPDX-License-Identifier: Apache-2.0

import {PathEx} from '../../../business/utils/path-ex.js';

export type HelmChartValue = string | number | boolean;

export class HelmChartValues {
  // Solo-supplied arguments (values files and --set flags); processed before user arguments.
  private readonly _arguments: string[] = [];

  // User-supplied values files; always appended last so they take precedence over Solo defaults.
  private readonly _userArguments: string[] = [];

  public set(name: string, value: HelmChartValue): this {
    this._arguments.push('--set', `${name}=${value}`);
    return this;
  }

  public setLiteral(name: string, value: HelmChartValue): this {
    this._arguments.push('--set-literal', `${name}=${value}`);
    return this;
  }

  public setFile(name: string, path: string): this {
    this._arguments.push('--set-file', `${name}=${path}`);
    return this;
  }

  /** Add a Solo-supplied values file (processed before user files). */
  public file(path: string): this {
    this._arguments.push('--values', path);
    return this;
  }

  /** Add a user-supplied values file (always processed last, overriding Solo defaults). */
  public userFile(path: string): this {
    this._userArguments.push('--values', path);
    return this;
  }

  public add(values: HelmChartValues): this {
    this._arguments.push(...values._arguments);
    this._userArguments.push(...values._userArguments);
    return this;
  }

  public arguments(...arguments_: string[]): this {
    this._arguments.push(...arguments_);
    return this;
  }

  /** Returns all arguments with Solo-supplied values first, user-supplied values last. */
  public toArguments(): string[] {
    return [...this._arguments, ...this._userArguments];
  }

  public isEmpty(): boolean {
    return this._arguments.length === 0 && this._userArguments.length === 0;
  }

  public setMany(values: Record<string, HelmChartValue>): this {
    for (const [name, value] of Object.entries(values)) {
      this.set(name, value);
    }

    return this;
  }

  public clone(): HelmChartValues {
    const cloned: HelmChartValues = new HelmChartValues();
    cloned._arguments.push(...this._arguments);
    cloned._userArguments.push(...this._userArguments);
    return cloned;
  }

  /**
   * Parse a comma-separated list of file paths and add each as a user-supplied values file.
   * User files are always placed after Solo-supplied values so they take precedence.
   */
  public filesFromCommaSeparatedInput(input?: string): this {
    if (!input) {
      return this;
    }

    for (const path of input.split(',')) {
      const trimmedPath: string = path.trim();

      if (trimmedPath) {
        this.userFile(PathEx.resolve(trimmedPath));
      }
    }

    return this;
  }
}
