// SPDX-License-Identifier: Apache-2.0

import {ExportKubeconfigOptions} from './export-kubeconfig-options.js';

export class ExportKubeconfigOptionsBuilder {
  private constructor(
    private _name: string = 'kind',
    private _internal: boolean = false,
    private _kubeconfig?: string,
  ) {}

  public static builder(): ExportKubeconfigOptionsBuilder {
    return new ExportKubeconfigOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): ExportKubeconfigOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set whether to use internal or external address (default false).
   * @param internal
   */
  public internal(internal: boolean): ExportKubeconfigOptionsBuilder {
    this._internal = internal;
    return this;
  }

  /**
   * Set the kubeconfig path (default $KUBECONFIG or $HOME/.kube/config).
   * @param kubeconfig
   */
  public kubeconfig(kubeconfig: string): ExportKubeconfigOptionsBuilder {
    this._kubeconfig = kubeconfig;
    return this;
  }

  /**
   * Build the ExportLogsOptions instance.
   */
  public build(): ExportKubeconfigOptions {
    return new ExportKubeconfigOptions(this._name, this._internal, this._kubeconfig);
  }

  public static from(options: ExportKubeconfigOptions): ExportKubeconfigOptionsBuilder {
    if (!options) {
      return new ExportKubeconfigOptionsBuilder();
    }
    return new ExportKubeconfigOptionsBuilder(options.name, options.internal, options.kubeconfig);
  }
}
