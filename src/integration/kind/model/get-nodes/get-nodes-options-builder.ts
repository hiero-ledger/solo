// SPDX-License-Identifier: Apache-2.0

import {GetNodesOptions} from './get-nodes-options.js';

export class GetNodesOptionsBuilder {
  private constructor(
    private _name?: string,
    private _allClusters?: boolean,
  ) {}

  public static builder(): GetNodesOptionsBuilder {
    return new GetNodesOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): GetNodesOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set whether to list all nodes across all cluster contexts (default false).
   * @param allClusters
   */
  public allClusters(allClusters: boolean): GetNodesOptionsBuilder {
    this._allClusters = allClusters;
    return this;
  }

  /**
   * Build the ExportLogsOptions instance.
   */
  public build(): GetNodesOptions {
    return new GetNodesOptions(this._name, this._allClusters);
  }

  public static from(options: GetNodesOptions): GetNodesOptionsBuilder {
    if (!options) {
      return new GetNodesOptionsBuilder();
    }
    return new GetNodesOptionsBuilder(options.name, options.allClusters);
  }
}
