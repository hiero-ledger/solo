// SPDX-License-Identifier: Apache-2.0

import {type Options} from '../../request/options.js';
import {type KindExecutionBuilder} from '../../execution/kind-execution-builder.js';

/**
 * Options for the `kind cluster delete` command.
 */
export class LoadDockerImageOptions implements Options {
  /**
   * The name of the cluster context name (default "kind")
   */
  private readonly _name: string;

  /**
   * comma separated list of nodes to load images into
   */
  private readonly _nodes: string;

  /**
   * The Docker image to load.
   */
  private readonly _imageName: string;

  constructor(imageName: string, name?: string, nodes?: string) {
    this._imageName = imageName;
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
    builder.positional(this._imageName);
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
  get name(): string {
    return this._name;
  }

  /**
   * The nodes to load images into.
   */
  get nodes(): string {
    return this._nodes;
  }
}
