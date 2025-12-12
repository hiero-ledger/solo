// SPDX-License-Identifier: Apache-2.0

import {type Options} from '../../request/options.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';

/**
 * Options for the `kind get nodes` command.
 */
export class GetNodesOptions implements Options {
  /**
   * The name of the cluster context name (default "kind")
   */
  private readonly _name: string;

  /**
   * If present, list all the available nodes across all cluster contexts.
   * Current context is ignored even if specified with --name.
   */
  private readonly _allClusters: boolean;

  public constructor(name?: string, allClusters: boolean = false) {
    if (name) {
      this._name = name;
    }
    this._allClusters = allClusters;
  }

  /**
   * Apply the options to the KindExecutionBuilder.
   * @param builder The KindExecutionBuilder to apply options to.
   */
  public apply(builder: KindExecutionBuilder): void {
    if (this._name) {
      builder.argument('name', this._name);
    }
    if (this._allClusters) {
      builder.flag('--all-clusters');
    }
  }

  /**
   * The name of the cluster.
   */
  public get name(): string {
    return this._name;
  }

  /**
   * Whether to list all nodes across all cluster contexts.
   */
  public get allClusters(): boolean {
    return this._allClusters;
  }
}
