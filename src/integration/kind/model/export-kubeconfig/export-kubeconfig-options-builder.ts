// SPDX-License-Identifier: Apache-2.0

import {ExportKubeConfigOptions} from './export-kubeconfig-options.js';

export class ExportKubeConfigOptionsBuilder {
  private constructor(
    private _name: string = 'kind',
    private _internal: boolean = false,
    private _kubeconfig?: string,
  ) {}

  public static builder(): ExportKubeConfigOptionsBuilder {
    return new ExportKubeConfigOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): ExportKubeConfigOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set whether to use internal or external address (default false).
   * @param internal
   */
  public internal(internal: boolean): ExportKubeConfigOptionsBuilder {
    this._internal = internal;
    return this;
  }

  /**
   * Set the kubeconfig path (default $KUBECONFIG or $HOME/.kube/config).
   * @param kubeconfig
   */
  public kubeconfig(kubeconfig: string): ExportKubeConfigOptionsBuilder {
    this._kubeconfig = kubeconfig;
    return this;
  }

  /**
   * Build the ExportLogsOptions instance.
   */
  public build(): ExportKubeConfigOptions {
    return new ExportKubeConfigOptions(this._name, this._internal, this._kubeconfig);
  }

  public static from(options: ExportKubeConfigOptions): ExportKubeConfigOptionsBuilder {
    if (!options) {
      return new ExportKubeConfigOptionsBuilder();
    }
    return new ExportKubeConfigOptionsBuilder(options.name, options.internal, options.kubeconfig);
  }
}
