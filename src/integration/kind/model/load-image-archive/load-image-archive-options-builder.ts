// SPDX-License-Identifier: Apache-2.0

import {LoadImageArchiveOptions} from './load-image-archive-options.js';

export class LoadImageArchiveOptionsBuilder {
  private constructor(
    private _name?: string,
    private _nodes?: string,
  ) {}

  public static builder(): LoadImageArchiveOptionsBuilder {
    return new LoadImageArchiveOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): LoadImageArchiveOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set the nodes to load images into.
   * @param nodes
   */
  public nodes(nodes: string): LoadImageArchiveOptionsBuilder {
    this._nodes = nodes;
    return this;
  }

  /**
   * Build the ExportLogsOptions instance.
   */
  public build(): LoadImageArchiveOptions {
    return new LoadImageArchiveOptions(this._name, this._nodes);
  }

  public static from(options: LoadImageArchiveOptions): LoadImageArchiveOptionsBuilder {
    if (!options) {
      return new LoadImageArchiveOptionsBuilder();
    }
    return new LoadImageArchiveOptionsBuilder(options.name, options.nodes);
  }
}
