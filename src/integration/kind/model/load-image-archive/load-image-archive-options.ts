// SPDX-License-Identifier: Apache-2.0

import {type Options} from '../../request/options.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';

/**
 * Options for the `kind cluster delete` command.
 */
export class LoadImageArchiveOptions implements Options {
  /**
   * The name of the cluster context name (default "kind")
   */
  private readonly _name: string;

  /**
   * comma separated list of nodes to load images into
   */
  private readonly _nodes: string;

  public constructor(name?: string, nodes?: string) {
    if (name) {
      this._name = name;
    }
    if (nodes) {
      this._nodes = nodes;
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
    if (this._nodes) {
      builder.argument('nodes', this._nodes);
    }
  }

  /**
   * The name of the cluster.
   */
  public get name(): string {
    return this._name;
  }

  /**
   * The nodes to load images into.
   */
  public get nodes(): string {
    return this._nodes;
  }
}
