// SPDX-License-Identifier: Apache-2.0

import {type Options} from '../../request/options.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';

/**
 * Options for the `kind cluster delete` command.
 */
export class ClusterDeleteOptions implements Options {
  /**
   * The name of the cluster.
   */
  private readonly _name: string;

  /**
   * If set, sets the kubeconfig path instead of using $KUBECONFIG or $HOME/.kube/config.
   */
  private readonly _kubeconfig: string;

  public constructor(name?: string, kubeconfig?: string) {
    if (name) {
      this._name = name;
    }
    if (kubeconfig) {
      this._kubeconfig = kubeconfig;
    }
  }

  /**
   * Apply the options to the KindExecutionBuilder.
   * @param builder The KindExecutionBuilder to apply options to.
   */
  public apply(builder: KindExecutionBuilder): void {
    if (this._name) {
      builder.argument('name', this._name);
    }
    if (this._kubeconfig) {
      builder.argument('kubeconfig', this._kubeconfig);
    }
  }

  /**
   * The name of the cluster.
   */
  public get name(): string {
    return this._name;
  }

  /**
   * sets kubeconfig path instead of $KUBECONFIG or $HOME/.kube/config
   */
  public get kubeconfig(): string {
    return this._kubeconfig;
  }
}
