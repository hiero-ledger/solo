// SPDX-License-Identifier: Apache-2.0

import {ClusterDeleteOptions} from './cluster-delete-options.js';

export class ClusterDeleteOptionsBuilder {
  private constructor(
    private _name?: string,
    private _kubeconfig?: string,
  ) {}

  public static builder(): ClusterDeleteOptionsBuilder {
    return new ClusterDeleteOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): ClusterDeleteOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set the kubeconfig path.
   * sets kubeconfig path instead of $KUBECONFIG or $HOME/.kube/config
   * @param kubeconfig
   */
  public kubeconfig(kubeconfig: string): ClusterDeleteOptionsBuilder {
    this._kubeconfig = kubeconfig;
    return this;
  }

  /**
   * Build the ClusterDeleteOptions instance.
   */
  public build(): ClusterDeleteOptions {
    return new ClusterDeleteOptions(this._name, this._kubeconfig);
  }

  public static from(options: ClusterDeleteOptions): ClusterDeleteOptionsBuilder {
    if (!options) {
      return new ClusterDeleteOptionsBuilder();
    }
    return new ClusterDeleteOptionsBuilder(options.name, options.kubeconfig);
  }
}
