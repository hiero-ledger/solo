// SPDX-License-Identifier: Apache-2.0

import {UpgradeChartOptions} from './upgrade-chart-options.js';

/**
 * Builder for {@link UpgradeChartOptions}.
 */
export class UpgradeChartOptionsBuilder {
  private _namespace?: string;
  private _kubeContext?: string;
  private _reuseValues: boolean = false;
  private _set?: string[];
  private _setLiteral?: string[];
  private _setFile?: string[];
  private _values?: string[];
  private _version?: string;
  private _install: boolean = false;
  private _createNamespace: boolean = false;

  private constructor() {}

  public static builder(): UpgradeChartOptionsBuilder {
    return new UpgradeChartOptionsBuilder();
  }

  /**
   * Sets the namespace where the release should be upgraded.
   * @param namespace The namespace.
   * @returns This builder instance.
   */
  public namespace(namespace: string): UpgradeChartOptionsBuilder {
    this._namespace = namespace;
    return this;
  }

  /**
   * Sets the Kubernetes context to use.
   * @param context The Kubernetes context.
   * @returns This builder instance.
   */
  public kubeContext(context: string): UpgradeChartOptionsBuilder {
    this._kubeContext = context;
    return this;
  }

  /**
   * Sets whether to reuse the last release's values.
   * @param reuse Whether to reuse values.
   * @returns This builder instance.
   */
  public reuseValues(reuse: boolean): UpgradeChartOptionsBuilder {
    this._reuseValues = reuse;
    return this;
  }

  /**
   * Set values on the command line.
   * @param valueOverride Values in key=value format.
   * @returns This builder instance.
   */
  public set(valueOverride: string[]): UpgradeChartOptionsBuilder {
    this._set = valueOverride;
    return this;
  }

  /**
   * Set literal values on the command line.
   * @param valueOverride Values in key=value format.
   * @returns This builder instance.
   */
  public setLiteral(valueOverride: string[]): UpgradeChartOptionsBuilder {
    this._setLiteral = valueOverride;
    return this;
  }

  /**
   * Set values from files on the command line.
   * @param valueOverride Values in key=path format.
   * @returns This builder instance.
   */
  public setFile(valueOverride: string[]): UpgradeChartOptionsBuilder {
    this._setFile = valueOverride;
    return this;
  }

  /**
   * Specify values in a YAML file.
   * @param values Values file paths.
   * @returns This builder instance.
   */
  public values(values: string[]): UpgradeChartOptionsBuilder {
    this._values = values;
    return this;
  }

  public install(install: boolean): UpgradeChartOptionsBuilder {
    this._install = install;
    return this;
  }

  public createNamespace(createNamespace: boolean): UpgradeChartOptionsBuilder {
    this._createNamespace = createNamespace;
    return this;
  }

  /**
   * Sets the version of the chart to upgrade to.
   * @param version The version.
   * @returns This builder instance.
   */
  public version(version: string): UpgradeChartOptionsBuilder {
    this._version = version;
    return this;
  }

  public build(): UpgradeChartOptions {
    return new UpgradeChartOptions(
      this._namespace,
      this._kubeContext,
      this._reuseValues,
      this._set,
      this._setLiteral,
      this._setFile,
      this._values,
      this._version,
      this._install,
      this._createNamespace,
    );
  }
}
