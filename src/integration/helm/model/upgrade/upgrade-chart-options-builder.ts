// SPDX-License-Identifier: Apache-2.0

import {UpgradeChartOptions} from './upgrade-chart-options.js';

/**
 * Builder for {@link UpgradeChartOptions}.
 */
export class UpgradeChartOptionsBuilder {
  private _namespace?: string;
  private _kubeContext?: string;
  private _reuseValues: boolean = false;
  private _extraArgs?: string;
  private _version?: string;

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
   * Sets additional arguments to pass to the helm command.
   * @param arguments_ The additional arguments.
   * @returns This builder instance.
   */
  public extraArgs(arguments_: string): UpgradeChartOptionsBuilder {
    this._extraArgs = arguments_;
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
      this._extraArgs,
      this._version,
    );
  }
}
